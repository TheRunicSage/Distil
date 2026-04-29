// Render-and-upload: turns the validated, date-injected ApplicationOutput
// into two DOCX buffers and uploads them to the `generated` bucket. Uses
// `upsert: true` so retries are idempotent (storage path is deterministic
// from user_id + application_id).
//
// Storage path scheme (app_handoff §6.3):
//   generated/{user_id}/{application_id}/cv.docx
//   generated/{user_id}/{application_id}/letter.docx

import "server-only";
import { ApiError } from "@/lib/errors/api-error";
import { renderCV } from "@/lib/docx/render-cv";
import { renderCoverLetter } from "@/lib/docx/render-cover-letter";
import { createServiceClient } from "@/lib/supabase/service";
import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";

const BUCKET = "generated";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type RenderAndUploadResult = {
  cv_storage_path: string;
  letter_storage_path: string;
};

export async function renderAndUpload(
  output: ApplicationOutputSuccess,
  applicationId: string,
  userId: string,
): Promise<RenderAndUploadResult> {
  const [cvBuffer, letterBuffer] = await Promise.all([
    renderCV(output.cv_content).catch(() => {
      throw new ApiError("rendering_failed");
    }),
    renderCoverLetter(output.cover_letter_content).catch(() => {
      throw new ApiError("rendering_failed");
    }),
  ]);

  const cvPath = `${userId}/${applicationId}/cv.docx`;
  const letterPath = `${userId}/${applicationId}/letter.docx`;

  const supabase = createServiceClient();

  const [cvUpload, letterUpload] = await Promise.all([
    supabase.storage.from(BUCKET).upload(cvPath, cvBuffer, {
      contentType: DOCX_MIME,
      upsert: true,
    }),
    supabase.storage.from(BUCKET).upload(letterPath, letterBuffer, {
      contentType: DOCX_MIME,
      upsert: true,
    }),
  ]);

  if (cvUpload.error || letterUpload.error) {
    throw new ApiError("storage_failed");
  }

  return {
    cv_storage_path: cvPath,
    letter_storage_path: letterPath,
  };
}
