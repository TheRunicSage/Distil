// Daily 02:30 NZT (14:30 UTC). Delete request_logs and telemetry_events
// older than 30 days. token_usage is kept forever (small + useful for
// billing analysis).

import "server-only";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const sweepRequestLogs = inngest.createFunction(
  {
    id: "sweep-request-logs",
    name: "Sweep Request Logs (30d)",
    triggers: [{ cron: "30 14 * * *" }],
  },
  async () => {
    return withCronLog("sweep-request-logs", async () => {
      const supabase = createServiceClient();
      const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

      const [logs, telemetry] = await Promise.all([
        supabase.from("request_logs").delete().lt("created_at", cutoff),
        supabase.from("telemetry_events").delete().lt("created_at", cutoff),
      ]);

      return {
        request_logs_error: logs.error?.message ?? null,
        telemetry_error: telemetry.error?.message ?? null,
      };
    });
  },
);
