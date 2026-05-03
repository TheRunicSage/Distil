// DeepSeek implementation of LlmProvider. Uses the OpenAI SDK
// pointed at https://api.deepseek.com (DeepSeek's chat completions
// endpoint is OpenAI-compatible). Model: deepseek-v4-pro by default
// per Decision Log step 8 DP-1 (2026-05-02 migration) — Pro tracks
// Sonnet 4.6's reasoning ceiling more closely than Flash and the
// cost delta is pennies per generation.
//
// DeepSeek has no server-side web search, so this provider runs a
// tool-call loop with two tools exposed to the model:
//   - submit_application: the same custom tool the Anthropic
//     provider uses (the JSON Schema is identical — derived from
//     ApplicationOutputSchema via lib/anthropic/tool-schema.ts).
//   - web_search: a synthetic tool that maps onto Tavily Search.
//
// Loop semantics:
//   - On each iteration, send {messages, tools} and read the
//     assistant message's tool_calls.
//   - If submit_application is among them, JSON.parse the args and
//     return — that's the final structured output.
//   - For each web_search call, run Tavily and append a tool-role
//     message with the JSON-encoded results.
//   - Cap web_search calls at MAX_WEB_SEARCH (5) — matches the
//     Anthropic provider's webSearchTool.max_uses. The 6th call
//     gets a "search budget exhausted" tool result instead of an
//     actual search; the model can still proceed and emit the
//     final submit_application call.
//   - Cap loop iterations at MAX_ITERATIONS (8) as a hard backstop
//     against runaway loops. Hitting it raises llm_invalid_output.
//
// Caching: DeepSeek's KV cache is on-disk and automatic — no
// cache_control markers. The system prompt naturally caches as a
// stable prefix across calls. Cache hit/miss tokens are reported
// per-iteration via prompt_cache_hit_tokens / prompt_cache_miss_
// tokens in the usage object; we sum them across iterations so
// calculateCost gets the totals right.
//
// Thinking-mode reasoning_content passthrough: V4-Pro's preview
// gateway routes to a reasoner backend even when we send no
// thinking flags (no extra_body, no reasoning_effort) — the same
// gateway behaviour that earlier forced us off tool_choice:"required"
// onto "auto" + a final-iteration submit reference. The reasoner
// backend always emits a reasoning_content field on each assistant
// turn, and per the DeepSeek docs:
//   "When using tool calls in thinking mode, it is crucial to pass
//    the complete reasoning_content back to the API in all
//    subsequent requests. Failure to do so will result in a 400
//    error from the API."
//   (https://api-docs.deepseek.com/guides/thinking_mode)
// So every assistant message we append to `messages` for the next
// loop iteration carries its reasoning_content. The OpenAI SDK's
// ChatCompletionMessageParam type doesn't surface the field, so the
// push site uses a narrow cast — DeepSeek accepts the extra
// property as a passthrough. Do not remove this on a future
// refactor; the loop will start 400-ing again the moment a
// reasoning-bearing turn isn't echoed back verbatim.
//
// Error mapping:
//   - Non-2xx from DeepSeek → ApiError("llm_failed").
//   - No submit_application tool call after MAX_ITERATIONS →
//     ApiError("llm_invalid_output").
//   - JSON.parse failure on submit_application arguments →
//     ApiError("llm_invalid_output") with the parse error attached
//     as cause so the with-inngest-step.ts cause-chain walker
//     surfaces it in request_logs.

import "server-only";
import OpenAI from "openai";

import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors/api-error";

import { calculateCost, type ModelName } from "@/lib/llm/pricing";
import type {
  CallLLMOptions,
  CallLLMResult,
  CallLLMUsage,
  LlmProvider,
  LlmTool,
} from "@/lib/llm/types";

import { tavilySearch } from "./tavily";

// Hard-locked to Pro. There is no env-var override that swaps this
// for Flash — Pro is the only DeepSeek variant Distil ever calls.
// Flash entries in lib/llm/pricing.ts and lib/admin/model-pill.ts
// exist solely so historical token_usage rows (or a deliberate
// future Flash experiment carved out as its own commit + Decision
// Point) still cost-out and render correctly. Changing this constant
// is the one and only way to route to Flash; it is not a config flip.
const MODEL: ModelName = "deepseek-v4-pro";
const DEFAULT_MAX_TOKENS = 16000;
const BASE_URL = "https://api.deepseek.com";

// Web-search budget. Realistic usage per system-prompt §3 Phase 2 +
// Phase 4 is 2-3 calls. Lowered 5 → 3 (2026-05-03) after the
// FUNCTION_INVOCATION_TIMEOUT incident: with reasoning_content
// engaged on V4-Pro's gateway, every iteration carries thousands of
// reasoning tokens, so each extra search round-trip costs both time
// and budget. The system-prompt budget rule remains the primary
// lever; the schema cushion was masking pressure on the time budget.
// On the Anthropic path (web_search_20250305 server-side) this cap
// is lib/anthropic/tool-schema.ts:webSearchTool.max_uses, separate.
const MAX_WEB_SEARCH = 3;
// Iteration cap = MAX_WEB_SEARCH searches + 1 final submit_application
// emission + 1 buffer iteration. Lowered 8 → 5 (2026-05-03) for the
// same FUNCTION_INVOCATION_TIMEOUT reason. Hitting the cap raises
// llm_invalid_output rather than letting the loop balloon.
const MAX_ITERATIONS = 5;
// Per-iteration timeout on the DeepSeek chat completion. 90s is
// well above the typical iteration time (~30-60s with reasoning
// engaged) but short enough that a single hung iteration can't
// blow the per-invocation Vercel ceiling. The OpenAI SDK's default
// is 600s (10 min), which is unsafe for our purposes — a single
// stalled call would consume the entire 800s function budget.
// On timeout we throw ApiError("llm_failed") which is retried by
// the Inngest function's outer retries: 0 policy (call-llm step
// is single-shot per generation) — meaning the whole generation
// errors fast, surfacing a clean failure rather than a soft hang.
const CHAT_COMPLETION_TIMEOUT_MS = 90_000;

const WEB_SEARCH_TOOL_NAME = "web_search";

export class DeepseekProvider implements LlmProvider {
  private _client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this._client) return this._client;
    if (!env.DEEPSEEK_API_KEY) {
      throw new ApiError(
        "internal_error",
        "DEEPSEEK_API_KEY missing while LLM_PROVIDER=deepseek",
      );
    }
    this._client = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: BASE_URL,
    });
    return this._client;
  }

  async callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
    const client = this.getClient();
    const submitToolName = opts.tools[0]?.name ?? "submit_application";

    // Tools sent to the model: the neutral submit tool plus our
    // synthetic web_search.
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      ...opts.tools.map(toOpenAiTool),
      webSearchToolDef(),
    ];

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: opts.system },
      { role: "user", content: opts.userMessage },
    ];

    let totalCacheMiss = 0;
    let totalCacheHit = 0;
    let totalOutput = 0;
    let webSearchCount = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // tool_choice strategy is constrained by DeepSeek's preview
      // gateway: as of 2026-05-03, sending tool_choice: "required"
      // against deepseek-v4-pro returns
      //   400 deepseek-reasoner does not support this tool_choice
      // because v4-pro is currently routed to the reasoner backend
      // under the hood, and the reasoner variant only accepts "auto"
      // or a specific {type: "function", function: {name}} reference.
      //
      // We therefore use:
      //   - "auto" on every normal iteration so the model can freely
      //     call web_search when it needs to (system prompt §3
      //     Phases 2 + 4) before committing to submit_application;
      //   - on the final iteration, a specific submit_application
      //     reference to force the model to commit (semantically
      //     equivalent to "required" since submit_application is
      //     the only tool that terminates the loop).
      // This matches the previous behaviour without tripping the
      // gateway rejection.
      const toolChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption =
        iteration === MAX_ITERATIONS - 1
          ? { type: "function", function: { name: submitToolName } }
          : "auto";

      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await client.chat.completions.create(
          {
            model: MODEL,
            max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            messages,
            tools,
            tool_choice: toolChoice,
          },
          // Per-call timeout shorter than the SDK default. See the
          // CHAT_COMPLETION_TIMEOUT_MS const above for reasoning.
          { timeout: CHAT_COMPLETION_TIMEOUT_MS },
        );
      } catch (err) {
        console.error(
          "[deepseek.callLLM] OpenAI SDK error for application",
          opts.applicationId,
          "-",
          err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        );
        if (err instanceof Error && (err as { status?: number }).status) {
          console.error(
            "[deepseek.callLLM] HTTP status:",
            (err as { status?: number }).status,
          );
        }
        const apiErr = new ApiError("llm_failed");
        (apiErr as Error & { cause?: unknown }).cause = err;
        throw apiErr;
      }

      const usage = response.usage as
        | (OpenAI.Completions.CompletionUsage & {
            prompt_cache_hit_tokens?: number;
            prompt_cache_miss_tokens?: number;
          })
        | undefined;
      if (usage) {
        const hit = usage.prompt_cache_hit_tokens ?? 0;
        const miss =
          usage.prompt_cache_miss_tokens ??
          // Fallback: if the cache fields aren't present, treat
          // everything as a miss to avoid undercounting cost.
          (usage.prompt_tokens ?? 0) - hit;
        totalCacheHit += hit;
        totalCacheMiss += Math.max(0, miss);
        totalOutput += usage.completion_tokens ?? 0;
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new ApiError("llm_invalid_output");
      }
      const message = choice.message;
      const toolCalls = message.tool_calls ?? [];

      // Did the model emit submit_application? If so, parse it and
      // return. We prefer the first matching call (multiple calls
      // shouldn't happen but the protocol allows it).
      const submitCall = toolCalls.find(
        (c) => c.type === "function" && c.function.name === submitToolName,
      );
      if (submitCall && submitCall.type === "function") {
        let toolInput: unknown;
        try {
          toolInput = JSON.parse(submitCall.function.arguments);
        } catch (err) {
          const apiErr = new ApiError("llm_invalid_output");
          (apiErr as Error & { cause?: unknown }).cause = err;
          throw apiErr;
        }
        const finalUsage: CallLLMUsage = {
          input_tokens: totalCacheMiss,
          output_tokens: totalOutput,
          cache_creation_tokens: 0, // DeepSeek doesn't bill writes
          cache_read_tokens: totalCacheHit,
          web_search_count: webSearchCount,
        };
        const cost_usd = calculateCost({ model: MODEL, ...finalUsage });
        return {
          toolInput,
          usage: finalUsage,
          cost_usd,
          model: MODEL,
        };
      }

      // No submit yet. Either web_search calls (run them) or no
      // tool calls at all (model bailed — append assistant content
      // and force the next iteration).
      const reasoningContent = extractReasoning(message);
      const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      if (reasoningContent) {
        // DeepSeek-only field; the OpenAI SDK type omits it but
        // DeepSeek accepts it as a passthrough and requires it on
        // every prior assistant turn (see the block comment at the
        // top of this file).
        (assistantMessage as { reasoning_content?: string }).reasoning_content =
          reasoningContent;
      }
      messages.push(assistantMessage);

      if (toolCalls.length === 0) {
        // No tool calls means free-text response; loop forces a
        // tool call on the last iteration. Skip ahead.
        continue;
      }

      // Run each tool call. Only web_search is supported here;
      // any other unexpected tool name returns an error tool result
      // so the model can recover.
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        if (call.function.name === WEB_SEARCH_TOOL_NAME) {
          const result = await runWebSearch(
            call.function.arguments,
            webSearchCount,
          );
          if (result.didSearch) webSearchCount += 1;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result.content,
          });
        } else if (call.function.name === submitToolName) {
          // Already handled above; never reaches here.
          continue;
        } else {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              error: `Unknown tool: ${call.function.name}`,
            }),
          });
        }
      }
    }

    // Loop exhausted without a submit_application call.
    throw new ApiError("llm_invalid_output");
  }
}

async function runWebSearch(
  argsJson: string,
  alreadyUsed: number,
): Promise<{ didSearch: boolean; content: string }> {
  if (alreadyUsed >= MAX_WEB_SEARCH) {
    // Graceful degrade — model is told the budget is exhausted and
    // can proceed with what it has. Better than a hard error which
    // kills the whole generation.
    return {
      didSearch: false,
      content: JSON.stringify({
        error:
          "web_search budget exhausted (3 calls maximum). " +
          "Proceed with the information already gathered.",
      }),
    };
  }

  let parsed: { query?: unknown };
  try {
    parsed = JSON.parse(argsJson) as { query?: unknown };
  } catch {
    return {
      didSearch: false,
      content: JSON.stringify({ error: "Invalid JSON in web_search arguments" }),
    };
  }
  const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
  if (!query) {
    return {
      didSearch: false,
      content: JSON.stringify({
        error: "web_search requires a non-empty 'query' string",
      }),
    };
  }

  try {
    const results = await tavilySearch({ query, maxResults: 5 });
    return {
      didSearch: true,
      content: JSON.stringify({ query, results }),
    };
  } catch (err) {
    // Tavily failures are surfaced to the model as a tool error
    // but don't abort the generation — the model can try a
    // different query or proceed with what it already has. The
    // ApiError thrown by tavilySearch is logged in its own
    // module's console.error so the underlying cause is visible.
    return {
      didSearch: false,
      content: JSON.stringify({
        error:
          err instanceof Error
            ? `Search failed: ${err.message}`
            : "Search failed",
      }),
    };
  }
}

// DeepSeek attaches reasoning_content on the response message when
// the call is routed to a reasoner backend (which V4-Pro's preview
// gateway does whether we ask for it or not). The OpenAI SDK types
// don't surface the field, so we read it via a narrow cast.
function extractReasoning(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): string | undefined {
  const value = (message as { reasoning_content?: unknown }).reasoning_content;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toOpenAiTool(
  tool: LlmTool,
): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function webSearchToolDef(): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: WEB_SEARCH_TOOL_NAME,
      description:
        "Search the web for current information. Use this for company " +
        "research (Phase 2: about-page, recent news, industry context) " +
        "and salary research (Phase 4). Returns a list of {title, url, " +
        "content} results; the content is a short snippet, not the full " +
        "page. Hard cap of 3 calls per generation — typical use is " +
        "2 Phase-2 calls + 1 Phase-4 call. The 4th call returns a " +
        "budget-exhausted error; plan accordingly.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Plain-English search query. Be specific — include the " +
              "company name + region for company research, or the role " +
              "+ seniority + 'salary NZ' for salary research.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  };
}

// toOpenAiToolChoice helper removed 2026-05-03: the loop now picks
// "auto" or a specific submit_application reference directly. Keeping
// it would mean carrying dead code that maps "required" through —
// "required" is the value DeepSeek's reasoner backend rejects, so
// nobody should be reaching for it.
