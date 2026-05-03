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

// Magic-byte fallback for browsers / OSs that send an empty or non-
// canonical file.type. Common cases: Windows Chrome on a freshly
// downloaded PDF can send "" or "application/octet-stream";
// Safari occasionally sends "application/x-pdf". We sniff the first
// few bytes to recover the real type rather than rejecting the file.
function sniffMimeFromBytes(bytes: Uint8Array): string | null {
  // PDF files start with "%PDF-" (0x25 0x50 0x44 0x46 0x2D).
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return PDF_MIME;
  }
  // DOCX is a ZIP container — local file header is "PK\x03\x04"
  // (0x50 0x4B 0x03 0x04). We don't bother distinguishing from
  // .xlsx/.pptx here because mammoth will reject those at parse
  // time as part of the existing master_cv_parse_failed path.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return DOCX_MIME;
  }
  return null;
}

function extFromFilename(name: string): "pdf" | "docx" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

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

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const reportedMime = file.type;
    const sniffedMime = sniffMimeFromBytes(bytes);
    const filenameExt = extFromFilename(file.name);

    // Diagnostic context for request_logs (Decision Log [10] pattern).
    // Always populated so even successful uploads carry the file
    // shape; on failure the wrapper reads ctx.metadata when writing
    // the error row, so we can debug the next failure without
    // needing the user to ship us the file.
    ctx.metadata = {
      file_size_bytes: file.size,
      reported_mime: reportedMime || "(empty)",
      sniffed_mime: sniffedMime ?? "(unrecognised)",
      filename_ext: filenameExt ?? "(none)",
    };

    // Trust the magic bytes over file.type. Browsers / OSs lie about
    // file.type often enough that the sniff is the source of truth.
    // Fall back to file.type only when bytes aren't a known signature
    // but the browser said something we recognise.
    const mime: string | null =
      sniffedMime ??
      (reportedMime === PDF_MIME || reportedMime === DOCX_MIME
        ? reportedMime
        : null);

    if (mime !== PDF_MIME && mime !== DOCX_MIME) {
      throw new ApiError("master_cv_unsupported_type");
    }

    const parsedText =
      mime === PDF_MIME
        ? await parsePdf(buffer)
        : await parseDocx(buffer);

    // Surface the post-parse text length too — a successful parse
    // that lands just above the 200-char floor is a useful signal
    // when triaging "the LLM said insufficient_input" later.
    ctx.metadata = {
      ...ctx.metadata,
      parsed_text_length: parsedText.length,
    };

    const ext = mime === PDF_MIME ? "pdf" : "docx";
    const cvId = crypto.randomUUID();
    const storagePath = `${userId}/${cvId}.${ext}`;

    const service = createServiceClient();

    const { error: uploadErr } = await service.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mime, upsert: false });
    if (uploadErr) throw new ApiError("storage_failed", uploadErr.message);

    // Three-step supersede + insert:
    //   1. Stamp `superseded_at` on the old current row (no FK pointer
    //      yet — `superseded_by` references master_cvs.id and the new
    //      row doesn't exist, so setting it now would trip the FK).
    //   2. Insert the new row. The old row is no longer in the partial
    //      unique index `master_cvs_one_current_per_user` (which
    //      filters `where superseded_at is null`), so the insert is
    //      free to claim the "current" slot.
    //   3. Stamp `superseded_by` on the old row, now that the new id
    //      exists. This is bookkeeping only — the old row's
    //      `superseded_at` already removed it from the index.
    // Each step checks for errors; the original code awaited and
    // discarded the update result, which silently swallowed FK
    // violations and produced a confusing "duplicate key" error two
    // statements later.
    const nowIso = new Date().toISOString();

    const { data: supersededRows, error: supersedeErr } = await service
      .from("master_cvs")
      .update({ superseded_at: nowIso })
      .eq("user_id", userId)
      .is("superseded_at", null)
      .select("id");
    if (supersedeErr) {
      await service.storage.from(BUCKET).remove([storagePath]);
      throw new ApiError("database_error", supersedeErr.message);
    }

    const { error: insertErr } = await service.from("master_cvs").insert({
      id: cvId,
      user_id: userId,
      storage_path: storagePath,
      mime_type: mime,
      file_size_bytes: file.size,
      parsed_text: parsedText,
    });
    if (insertErr) {
      // Roll back: undo the storage upload and re-clear superseded_at
      // on the old row(s) so the user keeps their previous CV.
      await service.storage.from(BUCKET).remove([storagePath]);
      if (supersededRows && supersededRows.length > 0) {
        await service
          .from("master_cvs")
          .update({ superseded_at: null })
          .in(
            "id",
            supersededRows.map((r) => r.id),
          );
      }
      throw new ApiError("database_error", insertErr.message);
    }

    // Step 3: write the back-pointer now that the new row exists.
    // Failure here is non-fatal — the new row is live, the old row is
    // already out of the unique index. Worst case: superseded_by stays
    // null, which is fine for the existing queries (none of them rely
    // on the back-pointer for correctness, only for orphan cleanup).
    if (supersededRows && supersededRows.length > 0) {
      await service
        .from("master_cvs")
        .update({ superseded_by: cvId })
        .in(
          "id",
          supersededRows.map((r) => r.id),
        );
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
