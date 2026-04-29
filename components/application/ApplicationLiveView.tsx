"use client";

// Live view for an application that hasn't reached a terminal state.
// Subscribes to /api/applications/[id]/events via EventSource and
// reloads the route segment on 'finalized' so the Server Component
// re-fetches with the post-terminal data. Polling fallback (spec
// §6.7): if no SSE event arrives for 10s, GET /api/applications/[id]
// every 5s and check status.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase =
  | "llm_started"
  | "llm_completed"
  | "rendering_started"
  | "finalized";

const PHASE_LABEL: Record<Phase, string> = {
  llm_started: "Researching the company and tailoring your CV…",
  llm_completed: "Drafting cover letter…",
  rendering_started: "Rendering your documents…",
  finalized: "Wrapping up…",
};

const TERMINAL = new Set([
  "success",
  "insufficient_input",
  "error",
  "abandoned",
  "cancelled",
]);

const POLL_INTERVAL_MS = 5000;
const POLL_AFTER_SILENCE_MS = 10_000;

type Props = {
  applicationId: string;
  initialStatus: string;
};

export function ApplicationLiveView({ applicationId, initialStatus }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [status, setStatus] = useState<string>(initialStatus);
  const lastEventAt = useRef<number>(Date.now());

  useEffect(() => {
    if (TERMINAL.has(initialStatus)) return;

    const url = `/api/applications/${applicationId}/events`;
    const es = new EventSource(url);

    es.addEventListener("phase", (raw: MessageEvent) => {
      lastEventAt.current = Date.now();
      try {
        const ev = JSON.parse(raw.data) as { phase: Phase };
        setPhase(ev.phase);
        if (ev.phase === "finalized") {
          es.close();
          router.refresh();
        }
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      // EventSource will auto-retry; if the run finished while we were
      // disconnected, the polling fallback below catches it.
    };

    const pollTimer = setInterval(async () => {
      const silentFor = Date.now() - lastEventAt.current;
      if (silentFor < POLL_AFTER_SILENCE_MS) return;
      try {
        const res = await fetch(`/api/applications/${applicationId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { status: string };
        if (body.status !== status) {
          setStatus(body.status);
          if (TERMINAL.has(body.status)) {
            es.close();
            router.refresh();
          }
        }
      } catch {
        // network blip — try again next tick
      }
    }, POLL_INTERVAL_MS);

    return () => {
      es.close();
      clearInterval(pollTimer);
    };
  }, [applicationId, initialStatus, router, status]);

  if (TERMINAL.has(status)) return null;

  const label = phase ? PHASE_LABEL[phase] : "Queued, kicking off shortly…";

  return (
    <div className="rounded-lg border border-border bg-dark3 p-8 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-orange border-t-transparent" />
      <p className="mt-4 text-sm text-text">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        You can leave this page; we&apos;ll keep working in the background.
      </p>
    </div>
  );
}
