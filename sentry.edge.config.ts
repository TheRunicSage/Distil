// Sentry init for the edge runtime (Next.js proxy.ts and any edge
// route handlers). Same DSN, same PII discipline. v1 has no edge
// routes by choice — proxy.ts is the only thing running here — but
// the file ships so middleware exceptions still surface.

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
