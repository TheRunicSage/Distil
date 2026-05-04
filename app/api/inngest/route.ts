// Inngest webhook handler. Registers every Inngest function with the
// platform and serves runs back to it. The seven functions match the
// build sequence step 10 surface.
//
// maxDuration: 300s is the hard cap on the Hobby plan ("Serverless
// Functions must have a maxDuration between 1 and 300 for plan
// hobby" — Vercel build error 2026-05-03). 800s caused every
// deploy from 049e1ee onwards to fail. The DeepSeek tool-call loop
// is bounded by TOTAL_LOOP_BUDGET_MS in lib/deepseek/provider.ts
// (currently sized to fit under this ceiling) plus per-iteration
// timeouts. Anthropic path runs in ~120s and never approaches the
// limit. If we move to Pro this can lift back to 800.

import { serve } from "inngest/next";

export const maxDuration = 300;

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
