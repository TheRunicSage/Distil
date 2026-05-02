// Provider-switch entry point. Reads LLM_PROVIDER at module load
// (which is when the Inngest function cold-boots) and instantiates
// the matching provider. The Inngest call site does
// `import { llm } from "@/lib/llm"` and treats the result as an
// opaque LlmProvider. Rollback during the DeepSeek migration is a
// Vercel env-var flip plus the next cold start; no redeploy needed.

import "server-only";

import { getLlmProvider } from "@/lib/env";
import { AnthropicProvider } from "@/lib/anthropic/provider";
import { DeepseekProvider } from "@/lib/deepseek/provider";
import type { LlmProvider } from "./types";

function pickProvider(): LlmProvider {
  const name = getLlmProvider();
  if (name === "deepseek") return new DeepseekProvider();
  return new AnthropicProvider();
}

export const llm: LlmProvider = pickProvider();

export type {
  LlmProvider,
  CallLLMOptions,
  CallLLMResult,
  CallLLMUsage,
  LlmTool,
  LlmToolChoice,
} from "./types";
export { calculateCost, PRICING, COST_CAPS_BY_MODEL } from "./pricing";
export type { ModelName } from "./pricing";
export { checkCostCapPre, checkCostCapPost } from "./cost-cap";
export { submitApplicationTool, SUBMIT_APPLICATION_TOOL_NAME } from "./tools";
