import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Next does not pick up the stray lockfile in $HOME.
    root: path.join(__dirname),
  },
  // Note: experimental.viewTransition + React's <ViewTransition>
  // was attempted 2026-05-14 but reverted because React 19.2.4
  // stable does not export unstable_ViewTransition — the wrapper
  // lives in React canary only. Re-enable once we move React to a
  // canary-channel release or React 19 ships ViewTransition stable.
};

// Sentry build-time wrapper. Source maps upload only when the
// SENTRY_AUTH_TOKEN / org / project envs are present, so local builds
// without those vars still pass through cleanly. Runtime init is in
// instrumentation.ts.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: false },
  disableLogger: true,
});
