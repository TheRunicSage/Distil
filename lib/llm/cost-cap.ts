// Per-generation cost guards for the LLM call. Two layers:
//   - checkCostCapPre: refuses pathological inputs before the API
//     spend, by estimating input cost from raw character counts at
//     the active provider's input rate.
//   - checkCostCapPost: logs a warning to request_logs when actual
//     cost exceeds the full cap. Money is already spent so it
//     never throws.
//
// Both gates are runaway-prose guards, not budgeting tools. The
// cap values live in lib/llm/pricing.ts (COST_CAPS_BY_MODEL) so a
// provider switch picks the right thresholds automatically.

import "server-only";
import * as Sentry from "@sentry/nextjs";

import { ApiError } from "@/lib/errors/api-error";
import { createServiceClient } from "@/lib/supabase/service";
import {
  COST_CAPS_BY_MODEL,
  PRICING,
  type ModelName,
} from "./pricing";

// Tokenizer rate-of-thumb across mixed English + JSON content;
// slightly conservative (lower chars/token = higher token estimate)
// so the gate triggers before reality, not after. The same constant
// served Anthropic well for a year of production runs and applies
// equally to DeepSeek's BPE.
const CHARS_PER_TOKEN = 3.5;

export function checkCostCapPre(
  model: ModelName,
  userMessageLength: number,
  systemPromptLength: number,
): void {
  const totalChars = userMessageLength + systemPromptLength;
  const estimatedInputTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  const estimatedInputCost =
    (estimatedInputTokens / 1_000_000) * PRICING[model].input_per_mtok;

  if (estimatedInputCost > COST_CAPS_BY_MODEL[model].precheck) {
    throw new ApiError("generation_too_large");
  }
}

export async function checkCostCapPost(
  model: ModelName,
  cost_usd: number,
  applicationId: string,
): Promise<void> {
  const cap = COST_CAPS_BY_MODEL[model].full;
  if (cost_usd <= cap) return;

  // Surface to Sentry as a warning so the "single call >cap" alert
  // (spec §7.6 Tier 1 #5) can still fire on it. captureMessage is
  // sync; we don't await any network delivery here.
  Sentry.captureMessage(
    `Generation cost ${cost_usd.toFixed(4)} USD exceeded cap of ${cap.toFixed(2)} USD (${model})`,
    {
      level: "warning",
      tags: {
        cost_cap_exceeded: "true",
        application_id: applicationId,
        llm_model: model,
      },
      extra: { cost_usd, cap_usd: cap, model },
    },
  );

  const supabase = createServiceClient();
  // Fire-and-forget. Failures here must not bubble; money is already
  // spent and the run should still complete cleanly.
  await supabase
    .from("request_logs")
    .insert({
      source: "inngest_step",
      name: "cost_cap_exceeded",
      duration_ms: 0,
      status: "error",
      error_code: "cost_cap_exceeded",
      error_message: `Generation cost ${cost_usd.toFixed(
        4,
      )} USD exceeded cap of ${cap.toFixed(2)} USD (${model})`,
      application_id: applicationId,
      metadata: { cost_usd, cap_usd: cap, model },
    })
    .then(() => undefined, () => undefined);
}
