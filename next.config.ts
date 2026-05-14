import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Next does not pick up the stray lockfile in $HOME.
    root: path.join(__dirname),
  },
  experimental: {
    // React View Transitions API integration (Next.js 16). Pairs with
    // <ViewTransition> in app/(app)/layout.tsx to cross-fade between
    // (app) routes on client-side navigation. Browsers without View
    // Transitions support fall back to instant navigation — the
    // correct progressive-enhancement behaviour. ThemeToggle already
    // uses the browser-native API directly for the circular reveal;
    // this flag layers React's wrapper on top so route changes also
    // animate.
    viewTransition: true,
  },
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
