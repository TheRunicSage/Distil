// Shared helper for sending a tailored CV + cover letter to a user.
// Used by:
//   - app/api/applications/[id]/email/route.ts (manual "Email me" button)
//   - inngest/functions/generate-application.ts (auto-email step when
//     profiles.email_on_generation = true)
//
// Always called with a service-role Supabase client (only path that can
// fetch the auth.users email + storage bytes regardless of caller
// auth context). Returns recipient + attachment count on success;
// throws ApiError on any failure. Telemetry is emitted internally for
// all three states (attempted / succeeded / failed) so callers don't
// have to repeat the wiring.

import type { SupabaseClient } from "@supabase/supabase-js";

import { asSuccessOutput, buildFilename } from "@/lib/docx/filename";
import { sendEmail, type EmailAttachment } from "@/lib/email/client";
import { renderApplicationEmail } from "@/lib/email/templates";
import { ApiError } from "@/lib/errors/api-error";
import { emitTelemetry } from "@/lib/telemetry/emit";

const BUCKET = "generated";

export type SendApplicationEmailResult = {
  to: string;
  attachmentCount: number;
};

export async function sendApplicationEmail(
  applicationId: string,
  service: SupabaseClient,
): Promise<SendApplicationEmailResult> {
  const startedAt = Date.now();

  // 1. Fetch application row (service-role bypasses RLS).
  const { data: app, error: appErr } = await service
    .from("applications")
    .select(
      "id, user_id, status, cv_storage_path, letter_storage_path, files_expire_at, files_deleted_at, completed_at, llm_response_json",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !app) {
    await failTelemetry(applicationId, "application_not_found");
    throw new ApiError("application_not_found");
  }
  if (app.status !== "success") {
    await failTelemetry(applicationId, "invalid_application_state");
    throw new ApiError("invalid_application_state");
  }
  if (
    app.files_deleted_at ||
    (app.files_expire_at &&
      new Date(app.files_expire_at).getTime() < Date.now())
  ) {
    await failTelemetry(applicationId, "files_expired");
    throw new ApiError("files_expired");
  }
  if (!app.cv_storage_path || !app.letter_storage_path) {
    await failTelemetry(applicationId, "files_expired");
    throw new ApiError("files_expired");
  }
  if (!app.user_id) {
    // user_id is nullable for rows preserved across account deletion
    // (Decision Log [14] 2026-05-01). Email is not deliverable.
    await failTelemetry(applicationId, "not_authenticated");
    throw new ApiError("not_authenticated");
  }

  // 2. Fetch recipient email from auth.users via service-role admin API.
  const { data: userData, error: userErr } =
    await service.auth.admin.getUserById(app.user_id);
  if (userErr || !userData?.user?.email) {
    await failTelemetry(applicationId, "not_authenticated");
    throw new ApiError("not_authenticated");
  }
  const recipientEmail = userData.user.email;

  // 3. Pull both DOCX files from storage in parallel.
  const successOut = asSuccessOutput(app.llm_response_json);
  const completedAt = app.completed_at
    ? new Date(app.completed_at)
    : new Date();

  const [cvDownload, letterDownload] = await Promise.all([
    service.storage.from(BUCKET).download(app.cv_storage_path),
    service.storage.from(BUCKET).download(app.letter_storage_path),
  ]);

  if (
    cvDownload.error ||
    !cvDownload.data ||
    letterDownload.error ||
    !letterDownload.data
  ) {
    await failTelemetry(applicationId, "storage_failed");
    throw new ApiError(
      "storage_failed",
      cvDownload.error?.message ?? letterDownload.error?.message,
    );
  }

  const cvBuf = Buffer.from(await cvDownload.data.arrayBuffer());
  const letterBuf = Buffer.from(await letterDownload.data.arrayBuffer());

  const attachments: EmailAttachment[] = [
    {
      filename: buildFilename("cv", successOut, completedAt),
      content: cvBuf.toString("base64"),
    },
    {
      filename: buildFilename("cover_letter", successOut, completedAt),
      content: letterBuf.toString("base64"),
    },
  ];

  // 4. Render template (graceful fallback handled inside).
  const rendered = renderApplicationEmail({
    recipientName: successOut?.cv_content.contact_details.full_name ?? null,
    role: successOut?.jd_analysis.role_archetype ?? null,
    company: successOut?.cover_letter_content.header.company_name ?? null,
  });

  // 5. Attempted telemetry.
  await emitTelemetry(
    "email.send.attempted",
    { application_id: applicationId },
    { user_id: app.user_id, application_id: applicationId },
  );

  // 6. Send. Propagate ApiError after emitting failed telemetry.
  try {
    await sendEmail({
      to: recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments,
    });
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "email_send_failed";
    await failTelemetry(applicationId, code, app.user_id);
    throw err;
  }

  // 7. Stamp last_emailed_at.
  await service
    .from("applications")
    .update({ last_emailed_at: new Date().toISOString() })
    .eq("id", applicationId);

  // 8. Success telemetry.
  await emitTelemetry(
    "email.send.succeeded",
    {
      application_id: applicationId,
      duration_ms: Date.now() - startedAt,
    },
    { user_id: app.user_id, application_id: applicationId },
  );

  return { to: recipientEmail, attachmentCount: attachments.length };
}

async function failTelemetry(
  applicationId: string,
  errorCode: string,
  userId?: string | null,
): Promise<void> {
  await emitTelemetry(
    "email.send.failed",
    { application_id: applicationId, error_code: errorCode },
    {
      user_id: userId ?? undefined,
      application_id: applicationId,
    },
  );
}
