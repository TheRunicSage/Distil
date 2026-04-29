// GET /api/applications/[id] — single application snapshot. Used by
// the SSE polling fallback (spec §6.7): if no SSE event arrives for
// 10s, the client polls this every 5s. Returns just the fields the
// frontend branches on, plus the LLM JSON if the run is finalised.

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors/api-error";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctxArg: RouteCtx) {
  const { id } = await ctxArg.params;
  const inner = withLogging("applications.get", async (_, ctx) => {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new ApiError("not_authenticated");
    ctx.user_id = userData.user.id;
    ctx.application_id = id;

    const { data: app } = await supabase
      .from("applications")
      .select(
        "id, status, attempt_number, queue_position, parent_application_id, job_description, user_notes, region, insufficient_input_reason, error_message, llm_response_json, files_expire_at, files_deleted_at, created_at, started_at, completed_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (!app) throw new ApiError("application_not_found");

    return NextResponse.json(app);
  });
  return inner(req as never);
}
