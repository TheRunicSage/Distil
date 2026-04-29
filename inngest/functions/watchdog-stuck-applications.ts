// Watchdog: every 15 minutes, finds applications stuck in 'running'
// for more than 30 minutes and marks them errored. Critical rules:
//   1. The update MUST include .eq('status', 'running') so a row that
//      legitimately completed between find and update is not stomped.
//   2. Every transition to error MUST set metadata_expires_at = now() + 1y.
//   3. Resume any items the failed application paused (status=paused → queued).
//   4. Fire 'application/generation.completed' so trigger-next-in-queue runs.

import "server-only";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const watchdogStuckApplications = inngest.createFunction(
  {
    id: "watchdog-stuck-applications",
    name: "Watchdog: Stuck Applications",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    return withCronLog("watchdog-stuck-applications", async () => {
      const supabase = createServiceClient();
      const cutoff = new Date(Date.now() - THIRTY_MINUTES_MS).toISOString();
      const metadataExpiresAt = new Date(
        Date.now() + ONE_YEAR_MS,
      ).toISOString();
      const nowIso = new Date().toISOString();

      const { data: stuck } = await supabase
        .from("applications")
        .select("id, user_id")
        .eq("status", "running")
        .lt("started_at", cutoff)
        .limit(50);

      if (!stuck || stuck.length === 0) return { recovered: 0 };

      let recovered = 0;
      for (const row of stuck) {
        const { error: updateErr } = await supabase
          .from("applications")
          .update({
            status: "error",
            error_message: "Application timed out (>30min in running state)",
            metadata_expires_at: metadataExpiresAt,
            completed_at: nowIso,
          })
          .eq("id", row.id)
          .eq("status", "running"); // guard: don't stomp a real success
        if (updateErr) continue;

        // Resume paused queue items for this user.
        await supabase
          .from("applications")
          .update({ status: "queued" })
          .eq("user_id", row.user_id)
          .eq("status", "paused");

        await step.sendEvent(`completed-${row.id}`, {
          name: "application/generation.completed",
          data: {
            application_id: row.id,
            user_id: row.user_id,
            outcome: "error",
          },
        });
        recovered += 1;
      }

      return { recovered };
    });
  },
);
