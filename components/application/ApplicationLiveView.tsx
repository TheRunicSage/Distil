"use client";

// Waiting screen for an application that hasn't reached a terminal state.
// Subscribes to /api/applications/[id]/events via EventSource and reloads
// the route segment on `finalized` so the Server Component re-fetches with
// post-terminal data. Polling fallback (spec §6.7): if no SSE event for
// 10s, GET /api/applications/[id] every 5s and check status.
//
// Layout (informed by the original Distil prototype):
//   - 4-stage step indicator across the top (Research → Draft → Render → Wrap)
//   - Centered dual-ring spinner with a phase-specific glyph
//   - Rotating Fraunces phrase + optional "Tailoring for {company}" subline
//   - Linear progress bar mapped to phase
//   - Elapsed timer
//
// Phrases rotate every 3.2s within a phase; phase boundaries reset the pool.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Phase =
  | "queued"
  | "llm_started"
  | "llm_completed"
  | "rendering_started"
  | "finalized";

const TERMINAL = new Set([
  "success",
  "insufficient_input",
  "error",
  "abandoned",
  "cancelled",
]);

// Stage indicator (4 logical stages, mapped from phase events).
type StageKey = "research" | "draft" | "render" | "wrap";
const STAGES: { key: StageKey; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "draft", label: "Draft" },
  { key: "render", label: "Render" },
  { key: "wrap", label: "Wrap" },
];

function stageIndexFromPhase(phase: Phase): number {
  switch (phase) {
    case "queued":
      return -1;
    case "llm_started":
      return 0;
    case "llm_completed":
      return 1;
    case "rendering_started":
      return 2;
    case "finalized":
      return 3;
  }
}

function progressFromPhase(phase: Phase): number {
  // Anchors per phase. Used as the starting point for the bar; the bar
  // smoothly tweens between anchors via a CSS transition on width.
  switch (phase) {
    case "queued":
      return 4;
    case "llm_started":
      return 28;
    case "llm_completed":
      return 64;
    case "rendering_started":
      return 86;
    case "finalized":
      return 100;
  }
}

const RESEARCH_PHRASES = [
  { text: "Reading between the lines of your experience" },
  { text: "Identifying the hiring company" },
  { text: "Searching the web for company signals" },
  { text: "Reading mission, values, and recent news" },
  { text: "Decoding what recruiters actually want" },
  { text: "Checking current ATS best practices" },
];

const GENERATION_PHRASES = [
  { text: "Mapping your strengths to the role" },
  { text: "Cutting through the noise" },
  { text: "Crafting your narrative" },
  { text: "Choosing bullets that earn their place" },
  { text: "Tailoring every word to this role" },
];

const RENDER_PHRASES = [
  { text: "Rendering ATS-safe documents" },
  { text: "Setting margins, polishing typography" },
];

const WRAP_PHRASES = [
  { text: "Final quality scan" },
  { text: "Storing your tailored CV" },
];

const QUEUED_PHRASES = [
  { text: "Queued. We'll start in a moment." },
];

function phrasesForPhase(phase: Phase): { text: string }[] {
  switch (phase) {
    case "queued":
      return QUEUED_PHRASES;
    case "llm_started":
      return RESEARCH_PHRASES;
    case "llm_completed":
      return GENERATION_PHRASES;
    case "rendering_started":
      return RENDER_PHRASES;
    case "finalized":
      return WRAP_PHRASES;
  }
}

const PHRASE_INTERVAL_MS = 3200;
const POLL_INTERVAL_MS = 5000;
const POLL_AFTER_SILENCE_MS = 10_000;

type Props = {
  applicationId: string;
  initialStatus: string;
  // ISO strings from the server so the elapsed timer reflects real
  // generation time, not "time since this component mounted". Without
  // this anchor the timer reset to 0s on every page refresh, which
  // made the waiting screen feel disconnected from reality.
  startedAt: string | null;
  createdAt: string;
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0
    ? `${m}m ${s.toString().padStart(2, "0")}s`
    : `${s}s`;
}

// Map an initial DB status to a starting phase. Newly-submitted rows
// arrive as `queued`; once Inngest's mark-running step fires, the row is
// `running` and the SSE channel typically delivers `llm_started` within
// a second or two — but if the user lands on the page during that
// window we want the waiting screen to read as research-in-flight, not
// queued.
function phaseForStatus(status: string): Phase {
  if (status === "queued" || status === "paused") return "queued";
  if (status === "running") return "llm_started";
  if (status === "rendering") return "rendering_started";
  return "queued";
}

export function ApplicationLiveView({
  applicationId,
  initialStatus,
  startedAt,
  createdAt,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(phaseForStatus(initialStatus));
  const [status, setStatus] = useState<string>(initialStatus);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const lastEventAt = useRef<number>(Date.now());

  // Elapsed timer (1s tick) anchored to whichever server timestamp is
  // most representative: prefer started_at (LLM started), fall back to
  // created_at (row submitted). This keeps the readout consistent
  // across page refreshes — refresh on a 90s-old run still reads ~90s,
  // not 0s.
  const anchorMs = useMemo(() => {
    const iso = startedAt ?? createdAt;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : Date.now();
  }, [startedAt, createdAt]);

  useEffect(() => {
    const compute = () => Math.max(0, Math.floor((Date.now() - anchorMs) / 1000));
    setElapsed(compute());
    const tick = setInterval(() => setElapsed(compute()), 1000);
    return () => clearInterval(tick);
  }, [anchorMs]);

  // Phrase rotation. Resets to index 0 whenever the phase changes so the
  // first phrase of the new pool is what the user sees.
  useEffect(() => {
    setPhraseIdx(0);
    const pool = phrasesForPhase(phase);
    if (pool.length <= 1) return;
    const tick = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % pool.length);
    }, PHRASE_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [phase]);

  // SSE + polling fallback.
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
          // Brief beat so the user sees the bar hit 100% before the page
          // swaps to the terminal view.
          setTimeout(() => {
            es.close();
            router.refresh();
          }, 600);
        } else {
          // Non-terminal phase transitions still mean the server-side
          // status has likely advanced (queued → running → rendering).
          // Refreshing keeps the header pill, status badge, and any
          // downstream views in sync with what the live view shows.
          router.refresh();
        }
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      // EventSource auto-retries; the polling fallback below catches any
      // run that finishes during a disconnect.
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
          // Always refresh the server component on any status change so
          // the header pill, queue context, and any downstream views
          // stay in sync — not just on terminal transitions.
          router.refresh();
          if (TERMINAL.has(body.status)) {
            es.close();
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

  const stageIdx = stageIndexFromPhase(phase);
  const progressPct = progressFromPhase(phase);
  const phrase = phrasesForPhase(phase)[phraseIdx]?.text ?? "";

  return (
    <section className="surface-card overflow-hidden">
      <StageIndicator stageIdx={stageIdx} />

      <div className="mt-10 flex flex-col items-center gap-6 px-2 pb-2">
        <DualRingSpinner phase={phase} />

        <div className="min-h-[64px] max-w-[480px] text-center">
          <p
            key={phrase}
            className="font-serif text-xl font-light leading-snug text-text"
            style={{ animation: "fade-up 0.4s ease-out" }}
          >
            {phrase}
          </p>
        </div>

        <ProgressBar pct={progressPct} />

        <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {formatElapsed(elapsed)} elapsed
        </p>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        You can leave this page — generation continues in the background. We
        keep this view in sync as long as you stay.
      </p>

      <style jsx>{`
        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}

function StageIndicator({ stageIdx }: { stageIdx: number }) {
  return (
    <ol className="flex items-start px-2">
      {STAGES.map((stage, i) => {
        const done = stageIdx > i;
        const active = stageIdx === i;
        const showRail = i < STAGES.length - 1;
        return (
          <li key={stage.key} className="flex flex-1 items-start">
            <div className="flex flex-col items-center gap-2">
              <span
                className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-all duration-500 ${
                  done
                    ? "border-orange bg-orange text-white"
                    : active
                      ? "border-orange bg-orange-subtle text-orange"
                      : "border-border bg-transparent text-muted-foreground"
                }`}
              >
                {done ? "✓" : i + 1}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full border-2 border-orange/70"
                  />
                )}
              </span>
              <span
                className={`text-[11px] tracking-wide transition-colors ${
                  active
                    ? "font-semibold text-text"
                    : done
                      ? "text-text/80"
                      : "text-muted-foreground"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {showRail && (
              <div
                className={`mt-4 h-px flex-1 transition-colors duration-500 ${
                  done ? "bg-orange" : "bg-border"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DualRingSpinner({ phase }: { phase: Phase }) {
  // Pick a glyph appropriate to the current phase. Pure ASCII / unicode
  // — no emoji-only — so light/dark mode rendering stays consistent.
  const glyph = useMemo(() => {
    switch (phase) {
      case "queued":
        return "·";
      case "llm_started":
        return "?";
      case "llm_completed":
        return "✎";
      case "rendering_started":
        return "▤";
      case "finalized":
        return "✓";
    }
  }, [phase]);

  return (
    <div className="relative h-20 w-20">
      <div
        aria-hidden
        className="absolute inset-0 rounded-full border-[3px] border-border"
        style={{
          borderTopColor: "var(--color-orange)",
          animation: "spin 1.05s linear infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-2 rounded-full border-2 border-border"
        style={{
          borderBottomColor: "var(--color-orange-light)",
          animation: "spin 1.6s linear infinite reverse",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-serif text-2xl font-light text-orange"
      >
        {glyph}
      </div>
      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-[3px] w-full max-w-[320px] overflow-hidden rounded-full bg-border"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${Math.max(2, Math.min(100, pct))}%`,
          background:
            "linear-gradient(90deg, var(--color-orange), var(--color-orange-light))",
        }}
      />
    </div>
  );
}
