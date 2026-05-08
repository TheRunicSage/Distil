// GET /api/master-cv/download — 302 redirects to a signed Supabase
// Storage URL with 60-second expiry for the user's currently-active
// master CV. Mirrors the application-download pattern at
// app/api/applications/[id]/download/[kind]/route.ts.

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors/api-error";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "master-cvs";
const SIGNED_URL_TTL_SECONDS = 60;
const PDF_MIME = "application/pdf";

function safeFilenameSegment(s: string, max = 40): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, max) || "Master_CV"
  );
}

export const GET = withLogging("master-cv.download", async (_req, ctx) => {
  const userClient = await createClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) throw new ApiError("not_authenticated");
  const userId = userData.user.id;
  ctx.user_id = userId;

  const { data: cv } = await userClient
    .from("master_cvs")
    .select("id, storage_path, mime_type")
    .eq("user_id", userId)
    .is("superseded_at", null)
    .maybeSingle();
  if (!cv?.storage_path) throw new ApiError("master_cv_required");

  // Filename: derive from the user's email local-part as a stable
  // identifier; we don't pull the master CV's original filename
  // because it isn't stored. The .pdf / .docx extension comes from
  // the mime type so the OS opens it with the right app.
  const ext = cv.mime_type === PDF_MIME ? "pdf" : "docx";
  const localPart = (userData.user.email ?? "candidate").split("@")[0];
  const filename = `${safeFilenameSegment(localPart)}_master_cv.${ext}`;

  const service = createServiceClient();
  const { data: signed, error: signErr } = await service.storage
    .from(BUCKET)
    .createSignedUrl(cv.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: filename,
    });
  if (signErr || !signed?.signedUrl) {
    throw new ApiError("storage_failed", signErr?.message);
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
});
