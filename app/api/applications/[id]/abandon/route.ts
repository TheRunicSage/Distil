// POST /api/applications/[id]/abandon — mark an insufficient_input
// application as abandoned, set metadata_expires_at if not already
// set, and resume paused queue items for the user. Used for both
// Screen 9 (attempts 1/2) and Screen 10 (attempt 3 "continue queue").

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors/api-error";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { emitTelemetry } from "@/lib/telemetry/emit";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctxArg: RouteCtx) {
  const { id } = await ctxArg.params;
  const inner = withLogging("applications.abandon", async (_, ctx) => {
    const userClient = await createClient();
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) throw new ApiError("not_authenticated");
    const userId = userData.user.id;
    ctx.user_id = userId;
    ctx.application_id = id;

    const service = createServiceClient();
    const { data: app } = await service
      .from("applications")
      .select("id, user_id, status, attempt_number, metadata_expires_at")
      .eq("id", id)
      .maybeSingle();
    if (!app) throw new ApiError("application_not_found");
    if (app.user_id !== userId) throw new ApiError("not_owner");
    if (app.status !== "insufficient_input") {
      throw new ApiError("invalid_application_state");
    }

    const nowIso = new Date().toISOString();
    const metadataExpiresAt =
      app.metadata_expires_at ??
      new Date(Date.now() + ONE_YEAR_MS).toISOString();

    const { error } = await service
      .from("applications")
      .update({
        status: "abandoned",
        abandoned_at: nowIso,
        metadata_expires_at: metadataExpiresAt,
      })
      .eq("id", id)
      .eq("status", "insufficient_input");
    if (error) throw new ApiError("database_error", error.message);

    await service
      .from("applications")
      .update({ status: "queued" })
      .eq("user_id", userId)
      .eq("status", "paused");

    void emitTelemetry(
      "application.abandon",
      {
        application_id: id,
        attempt_number: app.attempt_number as 1 | 2 | 3,
      },
      { user_id: userId, application_id: id, request_id: ctx.request_id },
    );

    return NextResponse.json({ ok: true });
  });
  return inner(req as never);
}
