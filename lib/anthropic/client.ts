// Thin wrapper around the Anthropic SDK that the Inngest call-llm step
// uses to run the single LLM call. Returns the raw tool input plus usage
// and cost; the caller is responsible for validating the input against
// ApplicationOutputSchema and writing the token_usage row.
//
// Decision Log step 8 DP-B: token_usage logging is performed by the
// caller (Inngest call-llm step) rather than this wrapper. The locked
// CLAUDE.md interface contract is updated accordingly.
//
// Decision Log step 8 DP-C (REVISED 2026-04-30): system prompt caching
// is now enabled. The system prompt is large (~30K chars / ~7–8K tokens)
// and stable across every call; sending it as a single text block with
// `cache_control: { type: "ephemeral" }` cuts ~$0.025 of input cost off
// every cache hit (5-min TTL is plenty for back-to-back retries and the
// handful of submissions we run within any given window). Cache token
// counts already feed into calculateCost so billing remains accurate.
//
// Decision Log step 8 DP-D: web_search_count comes from
// usage.server_tool_use.web_search_requests, which matches Anthropic's
// billing source of truth.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors/api-error";
import { calculateCost, type ModelName } from "./pricing";

const MODEL: ModelName = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 16000;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export type CallLLMOptions = {
  system: string;
  userMessage: string;
  tools: Anthropic.Messages.ToolUnion[];
  toolChoice:
    | Anthropic.ToolChoiceAuto
    | Anthropic.ToolChoiceTool
    | Anthropic.ToolChoiceAny;
  applicationId: string;
  maxTokens?: number;
};

export type CallLLMUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  web_search_count: number;
};

export type CallLLMResult = {
  toolInput: unknown;
  usage: CallLLMUsage;
  cost_usd: number;
  model: ModelName;
};

export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  const client = getClient();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      // System prompt sent as a single cached text block. Anthropic
      // caches the prefix up to and including the cache_control marker
      // so subsequent calls within the 5-min TTL hit at $0.30/MTok
      // instead of $3/MTok.
      system: [
        {
          type: "text",
          text: opts.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: opts.tools,
      tool_choice: opts.toolChoice,
      messages: [{ role: "user", content: opts.userMessage }],
    });
  } catch (err) {
    // The SDK throws on non-2xx and on network errors. The user-facing
    // surface stays "llm_failed" (spec error_message), but we attach
    // the original error as `cause` so the Inngest run, request_logs,
    // and Sentry can see what Anthropic actually said. Also log to
    // stderr so it shows up immediately in `npm run dev` output.
    console.error(
      "[anthropic.callLLM] Anthropic SDK error for application",
      opts.applicationId,
      "-",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    if (err instanceof Error && (err as { status?: number }).status) {
      console.error(
        "[anthropic.callLLM] HTTP status:",
        (err as { status?: number }).status,
      );
    }
    const apiErr = new ApiError("llm_failed");
    (apiErr as Error & { cause?: unknown }).cause = err;
    throw apiErr;
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUseBlock) {
    throw new ApiError("llm_invalid_output");
  }

  const usage: CallLLMUsage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    web_search_count: response.usage.server_tool_use?.web_search_requests ?? 0,
  };

  const cost_usd = calculateCost({ model: MODEL, ...usage });

  return {
    toolInput: toolUseBlock.input,
    usage,
    cost_usd,
    model: MODEL,
  };
}
