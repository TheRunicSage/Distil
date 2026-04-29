"use client";

// Live view for an application that hasn't reached a terminal state.
// Subscribes to /api/applications/[id]/events via EventSource and
// reloads the route segment on 'finalized' so the Server Component
// re-fetches with the post-terminal data. Polling fallback (spec
// §6.7): if no SSE event arrives for 10s, GET /api/applications/[id]
// every 5s and check status.
//
// UX: phase indicator renders the four-phase pipeline as a checklist,
// with the current phase pulsing and prior phases marked done. Elapsed
// timer ticks alongside so users know progress is real.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase =
  | "llm_started"
  | "llm_completed"
  | "rendering_started"
  | "finalized";

const PHASES: { key: Phase; label: string; hint: string }[] = [
  {
    key: "llm_started",
    label: "Researching the company",
    hint: "Web search, fit assessment, salary band",
  },
  {
    key: "llm_completed",
    label: "Drafting the cover letter",
    hint: "Storytelling paragraph 2, tone calibration",
  },
  {
    key: "rendering_started",
    label: "Rendering documents",
    hint: "Building the ATS-safe DOCX files",
  },
  {
    key: "finalized",
    label: "Wrapping up",
    hint: "Final quality scan and storage",
  },
];

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

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function ApplicationLiveView({ applicationId, initialStatus }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [status, setStatus] = useState<string>(initialStatus);
  const [elapsed, setElapsed] = useState(0);
  const lastEventAt = useRef<number>(Date.now());

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

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

  const phaseIndex = phase
    ? PHASES.findIndex((p) => p.key === phase)
    : -1;

  return (
    <div className="rounded-lg border border-border bg-dark3 p-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Tailoring in progress
        </p>
        <span className="font-mono text-xs text-muted-foreground">
          {formatElapsed(elapsed)} elapsed
        </span>
      </div>

      <ol className="mt-5 space-y-3">
        {PHASES.map((p, i) => {
          const done = phaseIndex > i;
          const active = phaseIndex === i;
          return (
            <li
              key={p.key}
              className={`flex items-start gap-3 rounded-sm border px-3 py-2.5 transition-colors ${
                active
                  ? "border-orange/40 bg-orange-dim"
                  : done
                    ? "border-success/25 bg-success/5"
                    : "border-border bg-dark2"
              }`}
            >
              <span
                aria-hidden
                className={`relative mt-1 inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${
                  active
                    ? "bg-orange"
                    : done
                      ? "bg-success"
                      : "border border-border bg-dark3"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-orange/60" />
                )}
              </span>
              <div className="flex-1">
                <p
                  className={`text-sm ${active ? "text-text" : done ? "text-text/80" : "text-muted-foreground"}`}
                >
                  {p.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.hint}</p>
              </div>
              {done && (
                <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-success">
                  done
                </span>
              )}
              {active && (
                <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-orange">
                  now
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-xs text-muted-foreground">
        You can leave this page — generation continues in the background.
        We&apos;ll keep this page in sync if you stay.
      </p>
    </div>
  );
}
