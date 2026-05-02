// Provider-neutral tool descriptors. The submit_application tool
// is the only custom tool the model emits — its JSON Schema is
// derived from ApplicationOutputSchema via the existing bridge in
// lib/anthropic/tool-schema.ts (kept under that path because the
// Anthropic provider still needs the SDK-typed `Tool.input_schema`
// shape for its own call). The DeepSeek provider takes the raw
// JSON Schema body out of that bridge and drops it under
// `function.parameters`.
//
// Web search is NOT in this list — both providers handle it
// internally (Anthropic via its server tool, DeepSeek via the
// Tavily-driven tool loop) so the Inngest call site doesn't need
// to know about it.

import {
  submitApplicationTool as anthropicSubmitTool,
  SUBMIT_APPLICATION_TOOL_NAME,
} from "@/lib/anthropic/tool-schema";
import type { LlmTool } from "./types";

export { SUBMIT_APPLICATION_TOOL_NAME };

// Lift the Anthropic tool's input_schema out as a plain JSON Schema
// object. The Anthropic SDK's `Tool` type narrows this to
// `{ type: "object", properties?, required? }`, which is exactly
// what OpenAI's `function.parameters` field expects.
export const submitApplicationTool: LlmTool = {
  name: anthropicSubmitTool.name,
  description: anthropicSubmitTool.description ?? "",
  parameters: anthropicSubmitTool.input_schema as Record<string, unknown>,
};
