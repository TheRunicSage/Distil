// Anthropic pricing constants and cost calculation. Verified against the
// official pricing page on 27 April 2026 (per app_handoff_v8.md §7.2).
// `cache_creation_tokens` is treated as 5-minute TTL by default; v1 does
// not enable 1-hour cache writes (see Decision Log step 8).

export const PRICING = {
  "claude-sonnet-4-6": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_write_5m_per_mtok: 3.75, // 1.25x input
    cache_write_1h_per_mtok: 6.0, // 2.0x input
    cache_read_per_mtok: 0.3, // 0.10x input
  },
} as const;

export const TOOL_PRICING = {
  web_search_per_call: 0.01, // $10 per 1000 searches
} as const;

export type ModelName = keyof typeof PRICING;

export function calculateCost(usage: {
  model: ModelName;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number; // assumes 5-min TTL
  cache_read_tokens: number;
  web_search_count: number;
}): number {
  const p = PRICING[usage.model];
  const tokenCost =
    (usage.input_tokens / 1_000_000) * p.input_per_mtok +
    (usage.output_tokens / 1_000_000) * p.output_per_mtok +
    (usage.cache_creation_tokens / 1_000_000) * p.cache_write_5m_per_mtok +
    (usage.cache_read_tokens / 1_000_000) * p.cache_read_per_mtok;
  const toolCost = usage.web_search_count * TOOL_PRICING.web_search_per_call;
  return Number((tokenCost + toolCost).toFixed(4));
}

// Per-generation cost cap. Pre-call estimate gate is half-cap on input
// alone; the post-call check warns (does not throw) at the full cap.
export const COST_CAP_USD = 1.0;
export const COST_CAP_PRECHECK_USD = 0.5;
