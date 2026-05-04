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
// Thinking mode disabled (2026-05-03 latency fix): we explicitly
// send `thinking: { type: "disabled" }` on every chat completion
// per the DeepSeek API reference
// (https://api-docs.deepseek.com/api/create-chat-completion —
// "Setting type to enabled uses thinking mode, while disabled uses
// non-thinking mode"). Without the disable flag, V4-Pro's preview
// gateway routes to the reasoner backend by default, which emitted
// thousands of reasoning tokens per turn and pushed worst-case
// runs past the 300s Vercel function ceiling
// (FUNCTION_INVOCATION_TIMEOUT incident, same date). The disable
// flag drops both per-iteration time and total cost without
// changing the prompt or schema.
//
// Defence-in-depth: we still capture reasoning_content from
// responses and pass it back on the next iteration's assistant
// message (extractReasoning + the reasoningContent branch in the
// loop body). Per the docs, omitting reasoning_content in thinking
// mode is what produced the original 400 error
// ("The reasoning_content in the thinking mode must be passed
// back to the API"). If the gateway ever ignores our disable flag
// on a given call — e.g. for a model variant that doesn't honour
// it, or a transient gateway issue — the passthrough keeps the
// loop alive instead of 400-ing on the next iteration. When
// disable takes effect (the expected case), reasoning_content is
// absent from responses and the passthrough is a no-op. Do not
// remove the passthrough; it is the safety net for the disable
// flag, and the cost when disable works is zero.
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

// Hard-locked to Flash (2026-05-04, post-Pro experiment). Pro's
// non-streaming throughput on the final submit_application emission
// (~6500 output tokens) routinely exceeded our per-iteration timeout
// even with thinking mode disabled — observed iteration 3 consuming
// the full 60s ceiling. Flash's output throughput is ~5-10x faster
// (~25s on the same payload), which fits the Hobby plan's 300s
// function ceiling with room for 5 web_search calls and salary
// triangulation. Quality risk is bounded by the heavily-specified
// system prompt: research is mechanical, fit assessment is rule-
// driven, writing follows a strict template — Flash without
// reasoning is roughly comparable to Pro without reasoning on
// structured output. If quality drops materially on storytelling
// (cover-letter paragraph 2) or fit nuance, revert this constant
// to "deepseek-v4-pro" and accept the runtime hit. Historical
// Pro token_usage rows still cost-out correctly via lib/llm/pricing.ts.
const MODEL: ModelName = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 16000;
const BASE_URL = "https://api.deepseek.com";

// Web-search budget. 5 calls — 2 Phase-2 (about-page + recent news)
// + 2-3 Phase-4 (salary triangulation across multiple sources for a
// firm prediction). Restored to 5 (2026-05-04) when we moved to
// Flash; Flash's faster throughput per iteration leaves room for
// the full research depth even under the Hobby plan's 300s ceiling.
// On the Anthropic path (web_search_20250305 server-side) the cap
// is lib/anthropic/tool-schema.ts:webSearchTool.max_uses, separate.
const MAX_WEB_SEARCH = 5;
// Iteration cap = MAX_WEB_SEARCH (5) + 1 final submit_application.
// Search iterations on Flash typically run ~5s each
// (CHAT_COMPLETION_TIMEOUT_MS, 45s); the final submit emission gets
// FINAL_ITERATION_TIMEOUT_MS (60s) since it produces ~6500 output
// tokens. Worst case 5 × 45s + 60s = 285s, fits under the 300s
// Hobby ceiling. Hitting the cap raises llm_invalid_output rather
// than letting the loop balloon further.
const MAX_ITERATIONS = 6;
// Per-iteration timeout for SEARCH iterations (anything that isn't
// the final submit_application emission). 45s is generous-but-
// bounded for Flash's typical search-iteration latency of ~3-5s,
// while leaving budget for slower outliers.
//
// We DO NOT rely on the OpenAI SDK's `{ timeout: ... }` option
// alone — observed in production 2026-05-03: a call-llm step
// hung 14+ minutes inside the loop with no thrown error and no
// log progression, indicating the SDK timeout did not fire (or
// the underlying fetch transport ignored the AbortSignal). To
// guarantee a deterministic ceiling we Promise.race the SDK call
// against a manual setTimeout that throws an ApiError("llm_failed").
// Both are kept (`{ timeout }` as the SDK's best-effort attempt,
// the race as the airtight backstop) so the inner controller can
// also try to abort the in-flight fetch.
const CHAT_COMPLETION_TIMEOUT_MS = 45_000;
// Per-iteration timeout for the FINAL submit_application emission.
// This iteration generates the entire structured payload (~6500
// output tokens) so it needs more headroom than search iterations.
// 60s on Flash is sufficient — observed ~25s on Pro's pre-disable
// runs; Flash without reasoning should be comparable or faster.
// Pro hit a 60s wall on the same emission shape; Flash's ~5x
// throughput lift is the entire reason this works.
const FINAL_ITERATION_TIMEOUT_MS = 60_000;
// Global wall clock on the entire callLLM() execution. Hard-stops
// the whole step before the Vercel function ceiling kicks in.
// 270s leaves 30s headroom under the 300s Hobby ceiling for the
// rest of the pipeline (validate, quality, render, upload,
// finalize ≈ 10-15s + Inngest step overhead).
const TOTAL_LOOP_BUDGET_MS = 270_000;

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

    const loopStartedAt = Date.now();

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Global wall clock — hard-stop the whole step if the loop
      // has drifted past the budget regardless of per-iteration
      // timeouts. Keeps the outer Inngest step bounded so the
      // application can fail-fast and the user sees an error
      // instead of a silent wedge.
      const elapsed = Date.now() - loopStartedAt;
      if (elapsed > TOTAL_LOOP_BUDGET_MS) {
        console.error(
          "[deepseek.callLLM] total loop budget exceeded for application",
          opts.applicationId,
          `- iteration=${iteration} elapsed_ms=${elapsed}`,
        );
        throw new ApiError(
          "llm_failed",
          `LLM loop exceeded ${TOTAL_LOOP_BUDGET_MS}ms wall-clock budget`,
        );
      }
      console.log(
        "[deepseek.callLLM] iter",
        iteration,
        "app",
        opts.applicationId,
        "messages",
        messages.length,
        "elapsed_ms",
        elapsed,
        "search_count",
        webSearchCount,
      );
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
      const iterStartedAt = Date.now();
      try {
        // thinking: { type: "disabled" } is the documented disable
        // flag per
        // https://api-docs.deepseek.com/api/create-chat-completion
        // ("Setting type to enabled uses thinking mode, while
        // disabled uses non-thinking mode"). Sent as a top-level
        // body field — DeepSeek accepts it directly per their cURL
        // examples; the Python SDK exposes it as extra_body but the
        // Node SDK forwards extra body keys verbatim. We use a cast
        // because the OpenAI SDK's type omits the field.
        // We KEEP the reasoning_content passthrough on assistant
        // messages (extractReasoning + assistantMessage block below)
        // as a defence-in-depth measure: if the gateway ignores the
        // disable flag on a given call, the loop won't 400 on the
        // next iteration. When disable takes effect, reasoning_content
        // is absent from responses and the passthrough is a no-op.
        const requestBody = {
          model: MODEL,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages,
          tools,
          tool_choice: toolChoice,
          thinking: { type: "disabled" },
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
        // Race the SDK call against a manual timer + AbortController.
        // The SDK's `{ timeout }` option is best-effort but observed
        // unreliable on Vercel (2026-05-03 incident: 14+ min hang
        // with no thrown error). The race below guarantees a thrown
        // ApiError after the timeout regardless.
        // Final iteration (the submit_application emission) gets a
        // longer timeout because it generates ~6500 output tokens
        // versus ~100 for a search-iteration tool_call.
        const isFinalIteration = iteration === MAX_ITERATIONS - 1;
        const iterationTimeoutMs = isFinalIteration
          ? FINAL_ITERATION_TIMEOUT_MS
          : CHAT_COMPLETION_TIMEOUT_MS;
        const abortController = new AbortController();
        const sdkPromise = client.chat.completions.create(requestBody, {
          timeout: iterationTimeoutMs,
          signal: abortController.signal,
        });
        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            abortController.abort();
            reject(
              new ApiError(
                "llm_failed",
                `DeepSeek chat completion exceeded ${iterationTimeoutMs}ms (iteration ${iteration})`,
              ),
            );
          }, iterationTimeoutMs);
        });
        try {
          response = await Promise.race([sdkPromise, timeoutPromise]);
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      } catch (err) {
        const iterDuration = Date.now() - iterStartedAt;
        console.error(
          "[deepseek.callLLM] error in iter",
          iteration,
          "for application",
          opts.applicationId,
          "after_ms",
          iterDuration,
          "-",
          err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        );
        if (err instanceof Error && (err as { status?: number }).status) {
          console.error(
            "[deepseek.callLLM] HTTP status:",
            (err as { status?: number }).status,
          );
        }
        // If the error is already an ApiError (e.g. our timeout
        // race threw it), forward as-is so the cause-chain walker
        // surfaces the right error_code in request_logs.
        if (err instanceof ApiError) throw err;
        const apiErr = new ApiError("llm_failed");
        (apiErr as Error & { cause?: unknown }).cause = err;
        throw apiErr;
      }
      const iterDuration = Date.now() - iterStartedAt;
      const responseHadReasoning = !!extractReasoning(
        response.choices[0]?.message ??
          ({} as OpenAI.Chat.Completions.ChatCompletionMessage),
      );
      console.log(
        "[deepseek.callLLM] iter",
        iteration,
        "completed in",
        iterDuration,
        "ms, output_tokens",
        response.usage?.completion_tokens ?? 0,
        "reasoning",
        responseHadReasoning ? "ON" : "off",
      );

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
          "web_search budget exhausted (5 calls maximum). " +
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
        "page. Hard cap of 5 calls per generation — typical use is " +
        "2 Phase-2 calls + 2-3 Phase-4 calls (salary needs triangulation " +
        "across multiple sources). The 6th call returns a budget-" +
        "exhausted error; plan accordingly.",
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
