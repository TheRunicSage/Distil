// POST /api/applications/[id]/retry — retry an insufficient_input
// application by creating a new row with parent_application_id linking
// back. attempt_number is hard-capped at 3. Optionally swaps in the
// current master CV via use_new_master_cv. Resumes paused queue items.

import { NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "@/inngest/client";
import { ApiError } from "@/lib/errors/api-error";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { emitTelemetry } from "@/lib/telemetry/emit";

const RetrySchema = z.object({
  job_description: z.string().min(150).max(20000).optional(),
  user_notes: z.string().max(2000).optional(),
  use_new_master_cv: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctxArg: RouteCtx) {
  const { id: parentId } = await ctxArg.params;
  const inner = withLogging("applications.retry", async (request, ctx) => {
    const userClient = await createClient();
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) throw new ApiError("not_authenticated");
    const userId = userData.user.id;
    ctx.user_id = userId;
    ctx.application_id = parentId;

    let bodyJson: unknown = {};
    try {
      bodyJson = await request.json();
    } catch {
      // Empty body is allowed (pure resubmit).
    }
    const parsed = RetrySchema.safeParse(bodyJson);
    if (!parsed.success) throw new ApiError("invalid_request");
    const opts = parsed.data;

    const service = createServiceClient();

    const { data: parent } = await service
      .from("applications")
      .select(
        "id, user_id, master_cv_id, job_description, user_notes, region, attempt_number, status",
      )
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) throw new ApiError("application_not_found");
    if (parent.user_id !== userId) throw new ApiError("not_owner");
    if (parent.status !== "insufficient_input") {
      throw new ApiError("invalid_application_state");
    }
    if (parent.attempt_number >= 3) {
      throw new ApiError("retry_limit_reached");
    }

    let masterCvId = parent.master_cv_id;
    if (opts.use_new_master_cv) {
      const { data: cv } = await service
        .from("master_cvs")
        .select("id")
        .eq("user_id", userId)
        .is("superseded_at", null)
        .maybeSingle();
      if (!cv) throw new ApiError("master_cv_required");
      masterCvId = cv.id;
    }

    const { data: tail } = await service
      .from("applications")
      .select("queue_position")
      .eq("user_id", userId)
      .order("queue_position", { ascending: false })
      .limit(1);
    const queuePosition =
      tail && tail.length > 0 ? tail[0].queue_position + 1 : 1;

    const id = crypto.randomUUID();
    const { error: insertErr } = await service.from("applications").insert({
      id,
      user_id: userId,
      master_cv_id: masterCvId,
      parent_application_id: parentId,
      job_description: opts.job_description ?? parent.job_description,
      user_notes: opts.user_notes ?? parent.user_notes,
      region: parent.region,
      attempt_number: parent.attempt_number + 1,
      status: "queued",
      queue_position: queuePosition,
    });
    if (insertErr) throw new ApiError("database_error", insertErr.message);

    // Resume any items the user has paused (siblings to the parent).
    await service
      .from("applications")
      .update({ status: "queued" })
      .eq("user_id", userId)
      .eq("status", "paused");

    await inngest.send({
      name: "application/generate.requested",
      data: { application_id: id, user_id: userId },
    });

    void emitTelemetry(
      "application.retry.succeeded",
      { application_id: id, parent_application_id: parentId },
      { user_id: userId, application_id: id, request_id: ctx.request_id },
    );

    return NextResponse.json(
      { id, parent_application_id: parentId, attempt_number: parent.attempt_number + 1 },
      { status: 202 },
    );
  });
  return inner(req as never);
}
