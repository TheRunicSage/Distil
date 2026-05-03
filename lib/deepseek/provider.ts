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
  LlmToolChoice,
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

// Web-search budget. Mirrors lib/anthropic/tool-schema.ts:webSearchTool.max_uses.
// Realistic usage per system-prompt §3 Phase 2 + Phase 4 is 2-3 calls;
// 5 is the hard cap that catches reformulation runs and salary
// triangulation without letting the loop balloon.
const MAX_WEB_SEARCH = 5;
// Iteration cap = MAX_WEB_SEARCH searches + 1 final submit_application
// emission + 2 buffer iterations for the model to re-think after
// sparse results before giving up.
const MAX_ITERATIONS = 8;

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
      // On the final allowed iteration, force a tool call so the
      // model can't escape with free text. Earlier iterations let
      // it pick (auto) so it can choose web_search when needed.
      const toolChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption =
        iteration === MAX_ITERATIONS - 1
          ? "required"
          : toOpenAiToolChoice(opts.toolChoice);

      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await client.chat.completions.create({
          model: MODEL,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages,
          tools,
          tool_choice: toolChoice,
        });
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
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });

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
        "page. Hard cap of 5 calls per generation — budget for 2-3 " +
        "typical, save the rest for reformulation or salary triangulation.",
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

function toOpenAiToolChoice(
  choice: LlmToolChoice,
): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption {
  if (choice === "auto") return "auto";
  if (choice === "required") return "required";
  return { type: "function", function: { name: choice.name } };
}
