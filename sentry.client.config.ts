// Sentry browser init. PII scrubbing on by default; no session replay
// (privacy concern given the app handles uploaded CV files). Errors
// only — no performance traces in v1 to keep the noise down.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // No replay integration by design.
  });
}
