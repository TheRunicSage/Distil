// GET /api/applications/[id]/download/[kind] — 302 redirects to a
// signed Supabase Storage URL with 60-second expiry. `kind` is 'cv' or
// 'cover_letter'. 410 Gone if the file expiry has passed.
//
// Filename per app_handoff §5.5:
//   {lastname}_CV_{company_short}_{yyyymmdd}.docx
//   {lastname}_CoverLetter_{company_short}_{yyyymmdd}.docx
// We pass the filename via the Content-Disposition response header on
// the signed URL using `download` option.

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors/api-error";
import { asSuccessOutput, buildFilename, type DocKind } from "@/lib/docx/filename";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "generated";
const SIGNED_URL_TTL_SECONDS = 60;

type RouteCtx = { params: Promise<{ id: string; kind: string }> };

export async function GET(req: Request, ctxArg: RouteCtx) {
  const { id, kind } = await ctxArg.params;
  const inner = withLogging("applications.download", async (_, ctx) => {
    if (kind !== "cv" && kind !== "cover_letter") {
      throw new ApiError("invalid_request");
    }
    const userClient = await createClient();
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) throw new ApiError("not_authenticated");
    ctx.user_id = userData.user.id;
    ctx.application_id = id;

    const { data: app } = await userClient
      .from("applications")
      .select(
        "id, status, cv_storage_path, letter_storage_path, files_expire_at, files_deleted_at, completed_at, llm_response_json",
      )
      .eq("id", id)
      .maybeSingle();
    if (!app) throw new ApiError("application_not_found");
    if (app.status !== "success") throw new ApiError("invalid_application_state");
    if (
      app.files_deleted_at ||
      (app.files_expire_at && new Date(app.files_expire_at).getTime() < Date.now())
    ) {
      throw new ApiError("files_expired");
    }

    const path =
      kind === "cv" ? app.cv_storage_path : app.letter_storage_path;
    if (!path) throw new ApiError("files_expired");

    const filename = buildFilename(
      kind as DocKind,
      asSuccessOutput(app.llm_response_json),
      app.completed_at ? new Date(app.completed_at) : new Date(),
    );

    const service = createServiceClient();
    const { data: signed, error: signErr } = await service.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: filename });
    if (signErr || !signed?.signedUrl) {
      throw new ApiError("storage_failed", signErr?.message);
    }

    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  });
  return inner(req as never);
}
