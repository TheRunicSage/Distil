// GET /api/admin/usage — last 50 applications + 7-day cost total.
// Powers the admin "usage" page (build sequence step 13).

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { withLogging } from "@/lib/logging/with-logging";
import { createServiceClient } from "@/lib/supabase/service";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const GET = withLogging("admin.usage", async (_req, ctx) => {
  const admin = await requireAdmin();
  ctx.user_id = admin.id;

  const service = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const [recentApps, recentUsage] = await Promise.all([
    service
      .from("applications")
      .select(
        "id, user_id, status, attempt_number, created_at, started_at, completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("token_usage")
      .select("cost_usd")
      .gte("created_at", sevenDaysAgo),
  ]);

  const sevenDayCost = (recentUsage.data ?? []).reduce(
    (sum, r) => sum + Number(r.cost_usd ?? 0),
    0,
  );

  return NextResponse.json({
    applications: recentApps.data ?? [],
    seven_day_cost_usd: Number(sevenDayCost.toFixed(4)),
  });
});
