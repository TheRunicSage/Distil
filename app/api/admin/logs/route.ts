// GET /api/admin/logs — last 20 errors from request_logs.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { withLogging } from "@/lib/logging/with-logging";
import { createServiceClient } from "@/lib/supabase/service";

export const GET = withLogging("admin.logs", async (_req, ctx) => {
  const admin = await requireAdmin();
  ctx.user_id = admin.id;

  const service = createServiceClient();
  const { data } = await service
    .from("request_logs")
    .select(
      "id, created_at, source, name, status, error_code, error_message, duration_ms, application_id, user_id",
    )
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ errors: data ?? [] });
});
