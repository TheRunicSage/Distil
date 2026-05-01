// Watchdog: every 15 minutes, recovers two classes of orphaned rows:
//   A. status='running' for >30min → mark errored
//      (the LLM call hung or the function crashed mid-flight)
//   B. status='queued' for >10min with started_at IS NULL → mark cancelled
//      (Inngest accepted the event but never invoked the function —
//      typically because Inngest Cloud function registration is stale,
//      the dev server is off, the kill switch was flipped, or the
//      worker crashed before the row was claimed)
//
// Pass B used to be 60 minutes, but a real prod incident showed users
// hitting the 3-deep queue cap with three orphaned `queued` rows that
// took an hour each to clean up. 10 minutes is enough margin to absorb
// a slow Inngest cold-start / function-sync window without leaving
// users blocked. The submit route also has compensating logic that
// marks the row errored synchronously when inngest.send() throws, so
// Pass B is the safety net for the silent-drop case (event accepted by
// Inngest, function never runs).
//
// Critical rules (apply to both passes):
//   1. The update MUST guard with the originating status so a row that
//      legitimately advanced between find and update is not stomped.
//   2. Every terminal transition MUST set metadata_expires_at = now() + 1y.
//   3. Fire 'application/generation.completed' so trigger-next-in-queue runs.
//
// Note: under Option B the watchdog no longer resumes paused siblings.
// Paused rows are a legacy artefact of the previous spec and get swept
// to cancelled by inngest/functions/sweep-paused after 1 hour.

import "server-only";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
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
      const runningCutoff = new Date(
        Date.now() - THIRTY_MINUTES_MS,
      ).toISOString();
      const queuedCutoff = new Date(
        Date.now() - TEN_MINUTES_MS,
      ).toISOString();
      const metadataExpiresAt = new Date(
        Date.now() + ONE_YEAR_MS,
      ).toISOString();
      const nowIso = new Date().toISOString();

      let recoveredRunning = 0;
      let recoveredQueued = 0;

      // Pass A: stuck running rows (LLM hung / function crashed).
      const { data: stuckRunning } = await supabase
        .from("applications")
        .select("id, user_id")
        .eq("status", "running")
        .lt("started_at", runningCutoff)
        .limit(50);

      for (const row of stuckRunning ?? []) {
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

        await step.sendEvent(`completed-${row.id}`, {
          name: "application/generation.completed",
          data: {
            application_id: row.id,
            user_id: row.user_id,
            outcome: "error",
          },
        });
        recoveredRunning += 1;
      }

      // Pass B: stuck queued rows that never reached the LLM. Created
      // >10min ago, started_at still null. Mark cancelled (terminal,
      // pre-LLM) so they stop counting toward the user's queue cap.
      const { data: stuckQueued } = await supabase
        .from("applications")
        .select("id, user_id")
        .eq("status", "queued")
        .is("started_at", null)
        .lt("created_at", queuedCutoff)
        .limit(50);

      for (const row of stuckQueued ?? []) {
        const { error: updateErr } = await supabase
          .from("applications")
          .update({
            status: "cancelled",
            metadata_expires_at: metadataExpiresAt,
            completed_at: nowIso,
          })
          .eq("id", row.id)
          .eq("status", "queued")
          .is("started_at", null); // guard: don't stomp a row that just started
        if (updateErr) continue;

        await step.sendEvent(`completed-${row.id}`, {
          name: "application/generation.completed",
          data: {
            application_id: row.id,
            user_id: row.user_id,
            outcome: "error",
          },
        });
        recoveredQueued += 1;
      }

      return { recoveredRunning, recoveredQueued };
    });
  },
);
