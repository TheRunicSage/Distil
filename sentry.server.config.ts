// Sentry server-side init. Same PII discipline as the client. The
// withLogging wrapper already calls Sentry.captureException for 5xx
// only; this config just connects the SDK and tags request_id /
// route per scope. The 4xx-vs-5xx filter is enforced upstream so
// invalid_request, queue_full, etc. don't pollute the error stream.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
