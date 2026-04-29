// GET /api/admin/telemetry — 7-day telemetry counts grouped by event
// name, plus a small submission funnel block. Mirrors /api/admin/logs
// shape: a single GET, returns JSON ready for the admin page chart.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { withLogging } from "@/lib/logging/with-logging";
import { createServiceClient } from "@/lib/supabase/service";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const GET = withLogging("admin.telemetry", async (_req, ctx) => {
  const admin = await requireAdmin();
  ctx.user_id = admin.id;

  const service = createServiceClient();
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const { data } = await service
    .from("telemetry_events")
    .select("name")
    .gte("created_at", since);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.name] = (counts[row.name] ?? 0) + 1;
  }

  const funnel = {
    attempted: counts["application.submit.attempted"] ?? 0,
    succeeded: counts["application.submit.succeeded"] ?? 0,
    finalized_success:
      (data ?? []).filter(
        (r) => r.name === "generation.finalized",
      ).length,
  };

  return NextResponse.json({ since, counts, funnel });
});
