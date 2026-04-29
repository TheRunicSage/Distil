// Per-generation cost guards for the LLM call. Two layers:
//   - checkCostCapPre: refuses pathological inputs before the API spend,
//     by estimating input cost from raw character counts.
//   - checkCostCapPost: logs a warning to request_logs when actual cost
//     exceeds the full cap. Money is already spent so it never throws.
//
// Called from the Inngest pipeline (steps 4 and 6 of generateApplication).
// See app_handoff_v8.md §7.6 Tier 1 item 1.

import * as Sentry from "@sentry/nextjs";
import { ApiError } from "@/lib/errors/api-error";
import { createServiceClient } from "@/lib/supabase/service";
import { PRICING, COST_CAP_USD, COST_CAP_PRECHECK_USD } from "./pricing";

// Anthropic's tokenizer averages ~3.5 chars per token across mixed English
// + JSON content. Slightly conservative (lower chars/token = higher token
// estimate) so the gate triggers before reality, not after.
const CHARS_PER_TOKEN = 3.5;

export function checkCostCapPre(
  userMessageLength: number,
  systemPromptLength: number,
): void {
  const totalChars = userMessageLength + systemPromptLength;
  const estimatedInputTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  const estimatedInputCost =
    (estimatedInputTokens / 1_000_000) *
    PRICING["claude-sonnet-4-6"].input_per_mtok;

  if (estimatedInputCost > COST_CAP_PRECHECK_USD) {
    throw new ApiError("generation_too_large");
  }
}

export async function checkCostCapPost(
  cost_usd: number,
  applicationId: string,
): Promise<void> {
  if (cost_usd <= COST_CAP_USD) return;

  // Surface to Sentry as a warning so the "single call >$1" alert
  // (spec §7.6 Tier 1 #5) can fire on it. captureMessage is sync; we
  // don't await any network delivery here.
  Sentry.captureMessage(
    `Generation cost ${cost_usd.toFixed(4)} USD exceeded cap of ${COST_CAP_USD.toFixed(2)} USD`,
    {
      level: "warning",
      tags: { cost_cap_exceeded: "true", application_id: applicationId },
      extra: { cost_usd, cap_usd: COST_CAP_USD },
    },
  );

  const supabase = createServiceClient();
  // Fire-and-forget. Failures here must not bubble; money is already spent
  // and the run should still complete cleanly.
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
      )} USD exceeded cap of ${COST_CAP_USD.toFixed(2)} USD`,
      application_id: applicationId,
      metadata: { cost_usd, cap_usd: COST_CAP_USD },
    })
    .then(() => undefined, () => undefined);
}
