// Next.js App Router instrumentation hook. Sentry's @sentry/nextjs
// expects this file at the project root for v8+ — it loads the right
// per-runtime config based on the Node/Edge runtime selector.
//
// Step 16: in dev mode, ping the Inngest dev server on boot. The
// number-one "applications stuck in queued" failure mode for new
// contributors is forgetting to run `npx inngest-cli dev` in another
// shell — surface a loud warning so they don't lose hours debugging.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    await checkInngestDevServer();
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

async function checkInngestDevServer(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  // Default Inngest dev server port; users override via INNGEST_DEV.
  const url = process.env.INNGEST_DEV ?? "http://localhost:8288";
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 750);
  try {
    const res = await fetch(`${url}/health`, { signal: ac.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    // eslint-disable-next-line no-console
    console.log(`[inngest] dev server reachable at ${url}`);
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      "\n[inngest] WARNING: dev server not reachable at " +
        url +
        "\n  Run `npx inngest-cli@latest dev` in another shell or queued " +
        "applications will sit forever.\n",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
