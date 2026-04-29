// Bridge from the canonical Zod ApplicationOutputSchema to the JSON Schema
// the Anthropic tool definition needs. Single source of truth: any change
// to the Zod schema flows automatically into the tool's input_schema.
//
// Decision Log step 8 DP-A: uses Zod v4's native z.toJSONSchema. The
// resulting draft-2020-12 output is accepted by Anthropic's tool API.
//
// Anthropic's SDK types `Tool.input_schema` as
// `{ type: 'object'; properties?: ...; required?: ... }` — note the literal
// `'object'`. z.toJSONSchema returns `type: string`, so we narrow the cast
// at the boundary instead of fighting the type.

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { ApplicationOutputSchema } from "@/lib/llm/output-schema";

export const SUBMIT_APPLICATION_TOOL_NAME = "submit_application";

// `target: "openapi-3.0"` produces JSON Schema dialect 2019-09 with the
// pragmatic shape Anthropic's tool engine expects (no $ref/allOf nesting
// that the discriminated union would otherwise emit). Refinements like
// the ATS coverage superRefine are server-side checks; they don't appear
// in the schema by design and are enforced again in validate-output.
const submitApplicationJsonSchema = z.toJSONSchema(ApplicationOutputSchema, {
  target: "openapi-3.0",
  unrepresentable: "any",
});

export const submitApplicationTool: Anthropic.Tool = {
  name: SUBMIT_APPLICATION_TOOL_NAME,
  description:
    "Submit the tailored CV and cover letter as structured JSON. " +
    "Either status='success' with all fields populated, or " +
    "status='insufficient_input' with insufficient_input_reason set.",
  input_schema: submitApplicationJsonSchema as Anthropic.Tool["input_schema"],
};

export const webSearchTool: Anthropic.Messages.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
};
