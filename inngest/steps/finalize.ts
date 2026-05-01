// Finalize: terminal state transitions on the applications row. Three
// distinct shapes — success, insufficient_input, and error — because
// each sets a different combination of columns. Common rule: every
// terminal state sets `metadata_expires_at = now() + 1 year`.
//
// Decision Log [option-B] (supersedes spec §): insufficient_input no
// longer pauses sibling queued items. Each generation completes
// independently; if a user wants to revisit a failed run, they hit the
// per-row Retry button in history. Existing paused rows in the DB are
// swept to `cancelled` after 1 hour by `inngest/functions/sweep-paused`.

import "server-only";
import { ApiError } from "@/lib/errors/api-error";
import { sanitiseErrorMessage } from "@/lib/errors/sanitise";
import { createServiceClient } from "@/lib/supabase/service";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export type FinalizeSuccessInput = {
  application_id: string;
  llm_response_json: unknown;
  cv_storage_path: string;
  letter_storage_path: string;
};

export async function finalizeSuccess(
  input: FinalizeSuccessInput,
): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date();
  const filesExpireAt = new Date(now.getTime() + SIXTY_DAYS_MS);
  const metadataExpiresAt = new Date(now.getTime() + ONE_YEAR_MS);

  const { error } = await supabase
    .from("applications")
    .update({
      status: "success",
      llm_response_json: input.llm_response_json,
      cv_storage_path: input.cv_storage_path,
      letter_storage_path: input.letter_storage_path,
      files_expire_at: filesExpireAt.toISOString(),
      metadata_expires_at: metadataExpiresAt.toISOString(),
      completed_at: now.toISOString(),
    })
    .eq("id", input.application_id);
  if (error) throw new ApiError("database_error");
}

export type FinalizeInsufficientInput = {
  application_id: string;
  user_id: string;
  reason: string;
  llm_response_json: unknown;
};

export async function finalizeInsufficient(
  input: FinalizeInsufficientInput,
): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date();
  const metadataExpiresAt = new Date(now.getTime() + ONE_YEAR_MS);

  const { error } = await supabase
    .from("applications")
    .update({
      status: "insufficient_input",
      insufficient_input_reason: input.reason,
      llm_response_json: input.llm_response_json,
      metadata_expires_at: metadataExpiresAt.toISOString(),
      completed_at: now.toISOString(),
    })
    .eq("id", input.application_id);
  if (error) throw new ApiError("database_error");

  // Note: under Option B we deliberately do NOT pause sibling queued
  // items. Each generation is independent; failed rows surface a Retry
  // button in history. The user_id arg is retained on the input type
  // for symmetry and future use, intentionally unused here.
  void input.user_id;
}

export type FinalizeErrorInput = {
  application_id: string;
  error_code: string;
  error: unknown;
};

export async function finalizeError(input: FinalizeErrorInput): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date();
  const metadataExpiresAt = new Date(now.getTime() + ONE_YEAR_MS);

  await supabase
    .from("applications")
    .update({
      status: "error",
      error_message: sanitiseErrorMessage(input.error),
      metadata_expires_at: metadataExpiresAt.toISOString(),
      completed_at: now.toISOString(),
    })
    .eq("id", input.application_id);
}

export async function markRunning(applicationId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("applications")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) throw new ApiError("database_error");
}

export async function markRendering(applicationId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("applications")
    .update({ status: "rendering" })
    .eq("id", applicationId);
  if (error) throw new ApiError("database_error");
}

export async function writePhaseEvent(
  applicationId: string,
  phase: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("generation_events")
    .insert({
      application_id: applicationId,
      phase,
      payload: payload ?? null,
    });
}
