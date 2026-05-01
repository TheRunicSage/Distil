// Sweep paused applications older than 1 hour → mark cancelled.
//
// Under Option B, no new code paths create `paused` rows. This cron
// exists for two reasons:
//   1. Legacy paused rows that already exist in the DB from runs prior
//      to the rule change.
//   2. Belt-and-braces: if a future change accidentally re-introduces
//      a paused write, the cron auto-cleans within an hour rather than
//      letting rows accumulate against the user's queue cap.
//
// Behaviour mirrors the watchdog's Pass A:
//   - Guard with .eq("status", "paused") so a row that just advanced
//     elsewhere is never stomped.
//   - Set metadata_expires_at = now() + 1y on every terminal transition.
//   - Fire 'application/generation.completed' so trigger-next-in-queue
//     advances the user's queue.

import "server-only";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

const SIXTY_MINUTES_MS = 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const sweepPausedApplications = inngest.createFunction(
  {
    id: "sweep-paused-applications",
    name: "Sweep Paused Applications",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    return withCronLog("sweep-paused-applications", async () => {
      const supabase = createServiceClient();
      const cutoff = new Date(Date.now() - SIXTY_MINUTES_MS).toISOString();
      const metadataExpiresAt = new Date(
        Date.now() + ONE_YEAR_MS,
      ).toISOString();
      const nowIso = new Date().toISOString();

      const { data: stale } = await supabase
        .from("applications")
        .select("id, user_id, created_at")
        .eq("status", "paused")
        .lt("created_at", cutoff)
        .limit(50);

      let cancelled = 0;
      for (const row of stale ?? []) {
        const { error: updateErr } = await supabase
          .from("applications")
          .update({
            status: "cancelled",
            metadata_expires_at: metadataExpiresAt,
            completed_at: nowIso,
          })
          .eq("id", row.id)
          .eq("status", "paused"); // guard
        if (updateErr) continue;

        await step.sendEvent(`completed-${row.id}`, {
          name: "application/generation.completed",
          data: {
            application_id: row.id,
            user_id: row.user_id,
            outcome: "cancelled",
          },
        });
        cancelled += 1;
      }

      return { cancelled };
    });
  },
);
