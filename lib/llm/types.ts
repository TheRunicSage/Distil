// Provider-neutral types for the single LLM call the Inngest pipeline
// makes per generation. Both the Anthropic and the DeepSeek provider
// implement against these so the call site (inngest/functions/
// generate-application.ts) stays provider-agnostic and the env-var
// toggle (LLM_PROVIDER) is a one-flip rollback during migration.
//
// Tool model: a single neutral "submit_application" tool descriptor
// goes in. The provider translates it into Anthropic's `Tool` shape
// (input_schema) or OpenAI's `function` shape (parameters). Web
// search is provider-internal — Anthropic uses its native server
// tool, DeepSeek runs Tavily inside a tool-call loop — so it does
// not appear in the neutral tool list.
//
// Usage shape: covers both providers' native fields. Anthropic
// reports cache_creation (write) tokens separately; DeepSeek does
// not bill cache writes and so leaves cache_creation_tokens at 0.
// cache_read_tokens carries Anthropic's cache_read_input_tokens or
// DeepSeek's prompt_cache_hit_tokens. cache_miss_input_tokens is
// DeepSeek-only; for Anthropic it's input_tokens minus cache_read.

import type { ModelName } from "./pricing";

export type LlmTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmToolChoice =
  | "auto"
  | "required"
  | { type: "tool"; name: string };

export type CallLLMOptions = {
  system: string;
  userMessage: string;
  tools: LlmTool[];
  toolChoice: LlmToolChoice;
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

export interface LlmProvider {
  callLLM(opts: CallLLMOptions): Promise<CallLLMResult>;
}
