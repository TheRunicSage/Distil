// POST /api/applications — submit a new application.
// Order of checks (each cheap-then-expensive):
//   1. authn
//   2. kill switch (read at request time)
//   3. body validation
//   4. master CV exists
//   5. queue cap (count rows in queued/paused/running/rendering)
//   6. daily cost ceiling (sum cost_usd for last 24h)
//   7. insert applications row with master_cv_id snapshot + queue_position
//   8. fire 'application/generate.requested' (idempotent because withIdempotency wraps the whole thing)

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { inngest } from "@/inngest/client";
import {
  getDailyCostCeilingUsd,
  isGenerationEnabled,
} from "@/lib/env";
import { ApiError } from "@/lib/errors/api-error";
import { withIdempotency } from "@/lib/idempotency/with-idempotency";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { emitTelemetry } from "@/lib/telemetry/emit";

const SubmitSchema = z.object({
  job_description: z.string().min(150).max(20000),
  user_notes: z.string().max(2000).optional(),
});

const QUEUE_CAP = 3;
const ACTIVE_STATUSES = ["queued", "paused", "running", "rendering"] as const;

export const POST = withLogging(
  "applications.submit",
  async (req: NextRequest, ctx) => {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new ApiError("not_authenticated");
    const userId = userData.user.id;
    ctx.user_id = userId;

    if (!isGenerationEnabled()) throw new ApiError("generation_disabled");

    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      throw new ApiError("invalid_request");
    }
    const parsed = SubmitSchema.safeParse(bodyJson);
    if (!parsed.success) {
      throw parsed.error.issues.some((i) => i.path[0] === "job_description")
        ? new ApiError("jd_too_short")
        : new ApiError("invalid_request");
    }
    const { job_description, user_notes } = parsed.data;

    const idempotencyKey = req.headers.get("Idempotency-Key");

    const { result, replayed } = await withIdempotency(
      {
        user_id: userId,
        route: "applications.submit",
        body: bodyJson,
        idempotencyKey,
      },
      async () => {
        const service = createServiceClient();

        // Master CV must exist.
        const { data: cv } = await service
          .from("master_cvs")
          .select("id")
          .eq("user_id", userId)
          .is("superseded_at", null)
          .maybeSingle();
        if (!cv) throw new ApiError("master_cv_required");

        // Queue cap.
        const { count: activeCount, error: countErr } = await service
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("status", ACTIVE_STATUSES as unknown as string[]);
        if (countErr) throw new ApiError("database_error");
        if ((activeCount ?? 0) >= QUEUE_CAP) {
          throw new ApiError("queue_full");
        }

        // Daily cost ceiling. Sum cost_usd from token_usage in last 24h.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: usage } = await service
          .from("token_usage")
          .select("cost_usd")
          .gte("created_at", since);
        const dailyTotal = (usage ?? []).reduce(
          (sum, r) => sum + Number(r.cost_usd ?? 0),
          0,
        );
        if (dailyTotal > getDailyCostCeilingUsd()) {
          throw new ApiError("daily_cost_ceiling_reached");
        }

        // Compute queue_position: max(queue_position) + 1 for this user
        // across all rows. Cheapest unique-monotonic strategy.
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
          master_cv_id: cv.id,
          job_description,
          user_notes: user_notes ?? null,
          region: "NZ",
          attempt_number: 1,
          status: "queued",
          queue_position: queuePosition,
        });
        if (insertErr) throw new ApiError("database_error", insertErr.message);

        await inngest.send({
          name: "application/generate.requested",
          data: { application_id: id, user_id: userId },
        });

        ctx.application_id = id;
        return { id, queue_position: queuePosition };
      },
    );

    if (replayed) ctx.replayed = true;

    void emitTelemetry(
      "application.submit.succeeded",
      { application_id: result.id, queue_position: result.queue_position },
      { user_id: userId, application_id: result.id, request_id: ctx.request_id },
    );

    return NextResponse.json(result, { status: 202 });
  },
);
