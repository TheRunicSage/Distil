// Anthropic implementation of LlmProvider. Wraps the Anthropic SDK's
// messages.create. Lives behind the LlmProvider interface so the call
// site (inngest/functions/generate-application.ts) doesn't know which
// provider runs the call — flipping LLM_PROVIDER to "deepseek" picks
// the other implementation in lib/llm/index.ts.
//
// Decision Log step 8 DP-B: token_usage logging is performed by the
// caller (Inngest call-llm step) rather than this wrapper.
//
// Decision Log step 8 DP-C (REVISED 2026-04-30): system prompt caching
// is enabled via a single ephemeral cache_control marker on the system
// block. The 5-min TTL covers back-to-back retries and the handful of
// submissions in any one admin session. Cache token counts feed into
// calculateCost so billing remains accurate.
//
// Decision Log step 8 DP-D: web_search_count comes from
// usage.server_tool_use.web_search_requests, which matches Anthropic's
// own billing source of truth.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors/api-error";

import { calculateCost, type ModelName } from "@/lib/llm/pricing";
import type {
  CallLLMOptions,
  CallLLMResult,
  CallLLMUsage,
  LlmProvider,
  LlmTool,
  LlmToolChoice,
} from "@/lib/llm/types";

import { webSearchTool } from "./tool-schema";

const MODEL: ModelName = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 16000;

export class AnthropicProvider implements LlmProvider {
  private _client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (this._client) return this._client;
    if (!env.ANTHROPIC_API_KEY) {
      throw new ApiError(
        "internal_error",
        "ANTHROPIC_API_KEY missing while LLM_PROVIDER=anthropic",
      );
    }
    this._client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return this._client;
  }

  async callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
    const client = this.getClient();
    const tools = [
      ...opts.tools.map(toAnthropicTool),
      // web_search server tool is provider-internal, not in the
      // neutral tool list. Anthropic runs the search in-band and
      // counts it via usage.server_tool_use.web_search_requests.
      webSearchTool,
    ];

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        // System prompt sent as a single cached text block. Anthropic
        // caches the prefix up to and including the cache_control
        // marker so subsequent calls within the 5-min TTL hit at
        // $0.30/MTok instead of $3/MTok.
        system: [
          {
            type: "text",
            text: opts.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: toAnthropicToolChoice(opts.toolChoice),
        messages: [{ role: "user", content: opts.userMessage }],
      });
    } catch (err) {
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

    // Skip server_tool_use blocks (web_search) — those are not the
    // submit_application tool call we care about. Find the first
    // tool_use that isn't a server tool.
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
}

function toAnthropicTool(tool: LlmTool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool["input_schema"],
  };
}

function toAnthropicToolChoice(
  choice: LlmToolChoice,
):
  | Anthropic.ToolChoiceAuto
  | Anthropic.ToolChoiceTool
  | Anthropic.ToolChoiceAny {
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.name };
}
