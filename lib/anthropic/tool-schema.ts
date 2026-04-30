// Bridge from the canonical Zod ApplicationOutputSchema to the JSON Schema
// the Anthropic tool definition needs. Single source of truth: any change
// to the Zod schema flows automatically into the tool's input_schema.
//
// Decision Log step 8 DP-A (REVISED): the original plan — let
// `z.toJSONSchema(ApplicationOutputSchema, { target: "openapi-3.0" })`
// emit the schema as-is — produced a root-level `oneOf` with no
// `type: "object"` field, which Anthropic's tool API rejects with
// `tools.0.custom.input_schema.type: Field required`. The discriminated
// union has no single root object shape to emit.
//
// Fix: still derive from the Zod schema (no duplication of field
// definitions, lengths, or enums), but at the bridge layer collapse the
// two oneOf branches into one root `type: "object"` schema with all
// branch-specific fields optional and only `status` required. The
// status enum becomes ["success", "insufficient_input"]. Branch
// correctness ("if status='success' then these fields must be present")
// is enforced post-call by the Inngest validate-output step's strict
// discriminated-union Zod parse — that runtime check is unchanged.
//
// Anthropic's SDK types `Tool.input_schema` as
// `{ type: 'object'; properties?: ...; required?: ... }` — note the literal
// `'object'`. We construct the schema with that exact shape.

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { ApplicationOutputSchema } from "@/lib/llm/output-schema";

export const SUBMIT_APPLICATION_TOOL_NAME = "submit_application";

type JsonObject = { [key: string]: unknown };

// Convert each discriminated-union branch separately, then merge.
const rawSchema = z.toJSONSchema(ApplicationOutputSchema, {
  target: "openapi-3.0",
  unrepresentable: "any",
}) as JsonObject;

function mergeBranches(schema: JsonObject): {
  properties: JsonObject;
  statusValues: string[];
} {
  const branches = (schema.oneOf ?? schema.anyOf) as JsonObject[] | undefined;
  if (!branches || branches.length === 0) {
    // Defensive: if Zod ever changes its emit and produces a single object
    // at the root, just pass the properties through.
    const props = (schema.properties ?? {}) as JsonObject;
    const statusProp = props.status as JsonObject | undefined;
    const enumValues = (statusProp?.enum as string[] | undefined) ?? [];
    return { properties: props, statusValues: enumValues };
  }

  const merged: JsonObject = {};
  const statusValues: string[] = [];

  for (const branch of branches) {
    const props = (branch.properties ?? {}) as JsonObject;
    for (const [key, value] of Object.entries(props)) {
      if (key === "status") {
        const statusProp = value as JsonObject;
        const constVal = statusProp.const as string | undefined;
        const enumVals = statusProp.enum as string[] | undefined;
        if (typeof constVal === "string") statusValues.push(constVal);
        if (Array.isArray(enumVals)) statusValues.push(...enumVals);
        continue;
      }
      if (!(key in merged)) merged[key] = value;
    }
  }

  merged.status = {
    type: "string",
    enum: Array.from(new Set(statusValues)),
    description:
      "Discriminator. Use 'success' when emitting the full tailored " +
      "application, or 'insufficient_input' when the inputs do not " +
      "support a high-quality output.",
  };

  return { properties: merged, statusValues };
}

const { properties } = mergeBranches(rawSchema);

const submitApplicationJsonSchema: Anthropic.Tool["input_schema"] = {
  type: "object",
  properties: properties as Anthropic.Tool["input_schema"]["properties"],
  required: ["status"],
};

export const submitApplicationTool: Anthropic.Tool = {
  name: SUBMIT_APPLICATION_TOOL_NAME,
  description:
    "Submit the tailored CV and cover letter as structured JSON. " +
    "The output is one of two shapes, selected by the `status` field:\n" +
    "  • status='success' — populate fit_assessment, research_summary, " +
    "jd_analysis, salary_band, cv_content, cover_letter_content, and " +
    "what_we_did_checklist. Do NOT set insufficient_input_reason.\n" +
    "  • status='insufficient_input' — populate insufficient_input_reason " +
    "only. Do NOT set any of the success-branch fields.\n" +
    "Mixing fields across branches will be rejected by the server-side " +
    "validator.",
  input_schema: submitApplicationJsonSchema,
};

export const webSearchTool: Anthropic.Messages.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
};
