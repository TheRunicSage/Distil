// Inngest webhook handler. Registers every Inngest function with the
// platform and serves runs back to it. The seven functions match the
// build sequence step 10 surface.
//
// maxDuration: lifted to 800s (well above Vercel's 300s default) so
// the call-llm step has headroom on the DeepSeek path. With reasoning
// mode engaged on V4-Pro's gateway, a 5-iteration tool-call loop can
// run 4-7 minutes before the model emits submit_application; the old
// 300s ceiling caused FUNCTION_INVOCATION_TIMEOUT (2026-05-03). 800s
// also covers retry replays. Anthropic path doesn't need this — it
// runs in 1.5-2 min — but the lifted ceiling costs nothing on that
// path because invocations end as soon as the function returns.

import { serve } from "inngest/next";

export const maxDuration = 800;

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
