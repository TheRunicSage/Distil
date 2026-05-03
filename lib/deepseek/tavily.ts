// Tiny Tavily Search API client. Used by the DeepSeek provider's
// tool-call loop in place of Anthropic's server-side web_search —
// DeepSeek has no native search, so we run it ourselves and feed
// the results back as a tool message. Spec details:
// https://docs.tavily.com/docs/rest-api/api-reference#endpoint-search
//
// Returns a compact, model-friendly shape: a list of {title, url,
// content} objects that fits naturally into a tool result message
// without overflowing the context. We deliberately strip Tavily's
// verbose `raw_content` and only keep the snippet they pre-extract,
// because feeding 50K tokens of raw HTML back per search would
// undo the cost-vs-Anthropic gains. search_depth defaults to
// "basic" — "advanced" doubles the price for a quality lift we
// haven't observed needing in practice.

import "server-only";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors/api-error";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

// 15s per Tavily call. The basic-depth endpoint typically returns in
// 1-3s; 15s is generous-but-bounded so a single hung query can't
// indefinitely wedge the DeepSeek tool-call loop and blow the
// per-invocation Vercel ceiling. On timeout we throw the same
// ApiError shape as a network failure — caller already handles it
// as a tool-result error and the model can try a different query
// or proceed with what it has.
const TAVILY_TIMEOUT_MS = 15_000;

export type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

export type TavilySearchOptions = {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
};

export async function tavilySearch(
  opts: TavilySearchOptions,
): Promise<TavilyResult[]> {
  if (!env.TAVILY_API_KEY) {
    throw new ApiError(
      "internal_error",
      "TAVILY_API_KEY missing while LLM_PROVIDER=deepseek",
    );
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    TAVILY_TIMEOUT_MS,
  );
  let res: Response;
  try {
    res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query: opts.query,
        max_results: opts.maxResults ?? 5,
        search_depth: opts.searchDepth ?? "basic",
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Network failure or timeout. The caller (DeepSeek tool loop)
    // treats this as a tool-result error but does NOT throw — the
    // model can try a different query or proceed with less data.
    // We log the underlying cause so request_logs surfaces it.
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || controller.signal.aborted);
    console.error(
      "[tavily.search]",
      isAbort ? "timeout" : "network error",
      "-",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    throw new ApiError(
      "internal_error",
      isAbort ? "Tavily search timed out" : "Tavily search request failed",
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[tavily.search] non-2xx", res.status, text.slice(0, 500));
    throw new ApiError(
      "internal_error",
      `Tavily search returned ${res.status}`,
    );
  }

  const body = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const results = body.results ?? [];
  return results.map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
  }));
}
