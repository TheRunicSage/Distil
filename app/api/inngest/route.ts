// Inngest webhook handler. Registers every Inngest function with the
// platform and serves runs back to it. The seven functions match the
// build sequence step 10 surface.

import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { generateApplication } from "@/inngest/functions/generate-application";
import { triggerNextInQueue } from "@/inngest/functions/trigger-next-in-queue";
import { expireFiles } from "@/inngest/functions/expire-files";
import { expireMetadata } from "@/inngest/functions/expire-metadata";
import { sweepRequestLogs } from "@/inngest/functions/sweep-request-logs";
import { sweepIdempotencyKeys } from "@/inngest/functions/sweep-idempotency-keys";
import { sweepPausedApplications } from "@/inngest/functions/sweep-paused";
import { watchdogStuckApplications } from "@/inngest/functions/watchdog-stuck-applications";
import { dailySummary } from "@/inngest/functions/daily-summary";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateApplication,
    triggerNextInQueue,
    expireFiles,
    expireMetadata,
    sweepRequestLogs,
    sweepIdempotencyKeys,
    sweepPausedApplications,
    watchdogStuckApplications,
    dailySummary,
  ],
});
