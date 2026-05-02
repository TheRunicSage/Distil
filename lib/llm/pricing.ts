// Unified pricing across LLM providers. Each entry is keyed by the
// model name we write into token_usage.model so admin pages can
// recompute cost from raw token counts.
//
// Anthropic — verified against the official pricing page on
// 27 April 2026 (per app_handoff_v8.md §7.2). Cache writes are
// metered separately at 5-minute or 1-hour TTL prices.
//
// DeepSeek V4 — pricing from
// https://api-docs.deepseek.com/quick_start/pricing as of the
// 2026-04-24 V4 preview release. DeepSeek's KV cache is on-disk
// and automatic; cache writes are NOT separately billed, so the
// model entries set cache_write fields to 0. Cache reads are
// reported as `prompt_cache_hit_tokens` in the usage object and
// priced at the cache-hit rate; cache misses are priced at the
// cache-miss rate (full input).

export const PRICING = {
  "claude-sonnet-4-6": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_write_5m_per_mtok: 3.75, // 1.25x input
    cache_write_1h_per_mtok: 6.0, // 2.0x input
    cache_read_per_mtok: 0.3, // 0.10x input
  },
  "deepseek-v4-pro": {
    input_per_mtok: 1.74, // cache-miss
    output_per_mtok: 3.48,
    cache_write_5m_per_mtok: 0, // automatic, not separately billed
    cache_write_1h_per_mtok: 0,
    cache_read_per_mtok: 0.145, // cache-hit
  },
  "deepseek-v4-flash": {
    input_per_mtok: 0.14, // cache-miss
    output_per_mtok: 0.28,
    cache_write_5m_per_mtok: 0,
    cache_write_1h_per_mtok: 0,
    cache_read_per_mtok: 0.028, // cache-hit
  },
} as const;

export const TOOL_PRICING = {
  // Anthropic web_search server tool — $10 per 1000 searches.
  web_search_per_call: 0.01,
  // Tavily Search API basic tier as of 2026-05-01 — $8 per 1000.
  // Used by the DeepSeek provider's tool loop in place of the
  // Anthropic server tool. Lifted to its own constant so the
  // DeepSeek cost calculation can pick the right rate without
  // hard-coding it inline.
  tavily_search_per_call: 0.008,
} as const;

export type ModelName = keyof typeof PRICING;

export function calculateCost(usage: {
  model: ModelName;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  web_search_count: number;
}): number {
  const p = PRICING[usage.model];
  // For DeepSeek, input_tokens is the cache-miss portion only (the
  // provider subtracts cache_read_tokens before passing it through).
  // For Anthropic, input_tokens is the cache-miss portion as well —
  // Anthropic's API already returns the two separately. Either way,
  // multiplying input_tokens × input_per_mtok and cache_read_tokens
  // × cache_read_per_mtok yields the right total without double-
  // billing.
  const tokenCost =
    (usage.input_tokens / 1_000_000) * p.input_per_mtok +
    (usage.output_tokens / 1_000_000) * p.output_per_mtok +
    (usage.cache_creation_tokens / 1_000_000) * p.cache_write_5m_per_mtok +
    (usage.cache_read_tokens / 1_000_000) * p.cache_read_per_mtok;
  // Web search price varies by provider; the caller passes the per-
  // call rate or sets web_search_count to 0 if it's running an
  // external search whose cost is summed separately.
  const searchPerCall = isDeepseekModel(usage.model)
    ? TOOL_PRICING.tavily_search_per_call
    : TOOL_PRICING.web_search_per_call;
  const toolCost = usage.web_search_count * searchPerCall;
  return Number((tokenCost + toolCost).toFixed(4));
}

function isDeepseekModel(model: ModelName): boolean {
  return model === "deepseek-v4-pro" || model === "deepseek-v4-flash";
}

// Per-generation cost cap. Pre-call estimate gates pathological
// inputs before the API spend; post-call check warns (does not
// throw) at the full cap. Caps scale per-provider so the gates
// stay meaningful at very different token prices.
//
// Anthropic Sonnet 4.6: $0.50 pre-cap on input alone gates at
// ~166K input tokens before tripping; $1.00 post-cap is ~3.5x
// the historical average ($0.29).
//
// DeepSeek V4-Pro: at $1.74/MTok input the same 166K-token
// tolerance lands at ~$0.29 — round to $0.30 for the pre-cap.
// Average gen on V4-Pro projects at ~$0.05; 3.5x of that is
// ~$0.18 — round to $0.20 for the post-cap. Both stay runaway-
// prose guards rather than budgeting tools.
//
// DeepSeek V4-Flash: ~10x cheaper than Pro on input; gates
// scale accordingly to stay tight enough to catch trouble.

type CapPair = { precheck: number; full: number };

export const COST_CAPS_BY_MODEL: Record<ModelName, CapPair> = {
  "claude-sonnet-4-6": { precheck: 0.5, full: 1.0 },
  "deepseek-v4-pro": { precheck: 0.3, full: 0.2 },
  "deepseek-v4-flash": { precheck: 0.05, full: 0.03 },
};

// Default Anthropic caps kept exported under the historic names so
// any caller that hasn't been moved over to the model-keyed lookup
// still gets the right values. New code should reach for
// COST_CAPS_BY_MODEL[model] instead.
export const COST_CAP_USD = COST_CAPS_BY_MODEL["claude-sonnet-4-6"].full;
export const COST_CAP_PRECHECK_USD =
  COST_CAPS_BY_MODEL["claude-sonnet-4-6"].precheck;
