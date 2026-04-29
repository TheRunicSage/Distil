// POST /api/master-cv — upload or replace the user's master CV.
// multipart/form-data; PDF or DOCX; ≤3MB; parsed text ≥200 chars.
// Versioned: existing current row gets superseded_at/superseded_by stamped
// before the new row is inserted. Storage upload happens via service-role
// client so we can place under the user's path even though the table
// row goes through the user-scoped server client.

import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "@/lib/errors/api-error";
import { withLogging } from "@/lib/logging/with-logging";
import { parsePdf } from "@/lib/parsing/parse-pdf";
import { parseDocx } from "@/lib/parsing/parse-docx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { emitTelemetry } from "@/lib/telemetry/emit";

const MAX_BYTES = 3 * 1024 * 1024;
const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BUCKET = "master-cvs";

export const POST = withLogging(
  "master-cv.upload",
  async (req: NextRequest, ctx) => {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new ApiError("not_authenticated");
    const userId = userData.user.id;
    ctx.user_id = userId;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new ApiError("invalid_request");
    }
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ApiError("invalid_request");
    if (file.size > MAX_BYTES) throw new ApiError("master_cv_too_large");

    const mime = file.type;
    if (mime !== PDF_MIME && mime !== DOCX_MIME) {
      throw new ApiError("master_cv_unsupported_type");
    }

    const buffer = await file.arrayBuffer();
    const parsedText =
      mime === PDF_MIME
        ? await parsePdf(buffer)
        : await parseDocx(buffer);

    const ext = mime === PDF_MIME ? "pdf" : "docx";
    const cvId = crypto.randomUUID();
    const storagePath = `${userId}/${cvId}.${ext}`;

    const service = createServiceClient();

    const { error: uploadErr } = await service.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mime, upsert: false });
    if (uploadErr) throw new ApiError("storage_failed", uploadErr.message);

    // Mark previous current row superseded (if any), then insert new.
    const nowIso = new Date().toISOString();
    await service
      .from("master_cvs")
      .update({ superseded_at: nowIso, superseded_by: cvId })
      .eq("user_id", userId)
      .is("superseded_at", null);

    const { error: insertErr } = await service.from("master_cvs").insert({
      id: cvId,
      user_id: userId,
      storage_path: storagePath,
      mime_type: mime,
      file_size_bytes: file.size,
      parsed_text: parsedText,
    });
    if (insertErr) {
      // Roll back the storage object so the next upload doesn't get a
      // unique-path collision.
      await service.storage.from(BUCKET).remove([storagePath]);
      throw new ApiError("database_error", insertErr.message);
    }

    void emitTelemetry(
      "master_cv.upload.succeeded",
      {
        file_size_bytes: file.size,
        mime_type: mime,
        duration_ms: 0,
      },
      { user_id: userId, request_id: ctx.request_id },
    );

    return NextResponse.json(
      { id: cvId, storage_path: storagePath },
      { status: 201 },
    );
  },
);
