// POST /api/applications/[id]/email — send the tailored CV + cover
// letter to the authenticated user's account email address as DOCX
// attachments via Resend.
//
// Recipient is always the auth email (DP-1 A); no body parameters
// accepted. Idempotency-Key header supported for double-click guard
// (DP-6 A+C). Only callable when application.status = 'success' and
// files haven't expired. Ownership enforced before any side effect.
//
// All the heavy lifting (storage fetch, template render, Resend call,
// last_emailed_at stamp, telemetry) lives in
// lib/email/send-application-email.ts so the auto-email pipeline step
// can reuse it.

import { NextResponse } from "next/server";

import { sendApplicationEmail } from "@/lib/email/send-application-email";
import { ApiError } from "@/lib/errors/api-error";
import { withIdempotency } from "@/lib/idempotency/with-idempotency";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctxArg: RouteCtx) {
  const { id } = await ctxArg.params;
  const inner = withLogging("applications.email", async (request, ctx) => {
    const userClient = await createClient();
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) throw new ApiError("not_authenticated");
    const userId = userData.user.id;
    ctx.user_id = userId;
    ctx.application_id = id;

    // Ownership check via RLS-respecting client: row only visible to
    // the owner. A miss here is either non-existent or someone else's.
    const { data: row } = await userClient
      .from("applications")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new ApiError("application_not_found");
    if (row.user_id !== userId) throw new ApiError("application_not_found");

    const idempotencyKey = request.headers.get("Idempotency-Key");

    const { result, replayed } = await withIdempotency(
      {
        user_id: userId,
        route: "applications.email",
        body: { application_id: id },
        idempotencyKey,
      },
      async () => {
        const service = createServiceClient();
        // sendApplicationEmail handles all telemetry + the
        // last_emailed_at stamp + throws ApiError on any failure shape.
        const send = await sendApplicationEmail(id, service);
        return { sent_to: send.to, attachment_count: send.attachmentCount };
      },
    );

    return NextResponse.json({ ...result, replayed });
  });
  return inner(req as never);
}
