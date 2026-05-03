"use client";

// Waiting screen for an application that hasn't reached a terminal state.
// Subscribes to /api/applications/[id]/events via EventSource and reloads
// the route segment on `finalized` so the Server Component re-fetches with
// post-terminal data. Polling fallback (spec §6.7): if no SSE event for
// 10s, GET /api/applications/[id] every 5s and check status.
//
// Layout (2026-05-01 redesign for the typical ~2-minute wait):
//   - Stage indicator across the top, centered via 4-col grid + absolute rail
//   - Hero block: gradient halo, dual-ring spinner, rotating phrase
//   - Progress bar + elapsed timer
//   - "What's happening now" mini-list (4 phase-specific bullets)
//
// Phrase pools are sized so a 2-minute wait does not loop visibly:
// research has 28 phrases at 3.2s each (~90s before repeat). The
// did-you-know carousel was removed 2026-05-01 because it was leaking
// behind-the-scenes implementation details (cost cap, cache TTL,
// observability) that customers should not see.
//
// 2026-05-03 disclosure scrub: phrase pools and PHASE_NOW bullets
// were rewritten to describe what the user is getting (tailored
// content, polished documents, fit assessment) rather than how the
// pipeline produces it. Earlier copy named ATS keyword extraction,
// the four-paragraph cover letter structure, the dense profile
// rendering, salary triangulation sources, and other internal
// mechanics that competitors could copy. The new copy is reassuring
// at the same cadence without revealing the recipe.

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
  "Reading your experience",
  "Studying the role",
  "Getting to know the company",
  "Understanding what this role really wants",
  "Matching your background to the brief",
  "Considering how to best position you",
  "Looking at the company's recent context",
  "Weighing your strongest evidence",
  "Considering the role's seniority",
  "Reading between the lines",
  "Connecting your experience to the role",
  "Looking for the real fit signals",
  "Considering tone and posture",
  "Identifying what matters most",
  "Thinking through how to lead with your strengths",
  "Considering what the recruiter will scan for",
  "Reading the role's ambitions",
  "Lining up the relevant parts of your story",
  "Considering the company's direction",
  "Working out the right framing",
  "Drawing the through-line in your background",
  "Considering what to emphasise",
  "Planning how to open the letter",
  "Considering how the cover letter should land",
  "Picking the right story to tell",
  "Considering pace and length",
  "Working out the strongest opening lines",
  "Setting up for a confident close",
];

const GENERATION_PHRASES = [
  "Tailoring your CV",
  "Writing your cover letter",
  "Choosing the strongest evidence",
  "Crafting your narrative",
  "Polishing the language",
  "Tightening for clarity",
  "Refining the story arc",
  "Pitching this for the role",
];

const RENDER_PHRASES = [
  "Preparing your documents",
  "Polishing the layout",
  "Finalising the formatting",
  "Saving your files securely",
];

const WRAP_PHRASES = [
  "Final quality check",
  "Computing your fit score",
  "Almost done",
  "Wrapping up",
];

const QUEUED_PHRASES = ["Queued. We'll start in a moment."];

function phrasesForPhase(phase: Phase): string[] {
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

// "What's happening now" — 4 mini-bullet captions per phase. These are
// the visible substance of the wait; they reassure the user that real,
// specific work is going on instead of a single "Loading…" spinner.
const PHASE_NOW: Record<Phase, { glyph: string; bullets: string[] }> = {
  queued: {
    glyph: "·",
    bullets: [
      "Reserved your spot in the queue",
      "Waiting for the previous run to finish",
      "We'll start as soon as the slot opens",
      "Hang tight — usually only a moment",
    ],
  },
  llm_started: {
    glyph: "?",
    bullets: [
      "Studying the role and the company",
      "Reading your experience in detail",
      "Working out what matters most here",
      "Matching your background to the brief",
    ],
  },
  llm_completed: {
    glyph: "✎",
    bullets: [
      "Tailoring your CV to this role",
      "Writing your cover letter",
      "Choosing the strongest evidence",
      "Calibrating tone and length",
    ],
  },
  rendering_started: {
    glyph: "▤",
    bullets: [
      "Preparing your CV",
      "Preparing your cover letter",
      "Polishing the layout",
      "Saving your files securely",
    ],
  },
  finalized: {
    glyph: "✓",
    bullets: [
      "Final quality check",
      "Computing your fit score",
      "Almost done",
      "Releasing your downloads",
    ],
  },
};

const PHRASE_INTERVAL_MS = 3200;
const POLL_INTERVAL_MS = 5000;
const POLL_AFTER_SILENCE_MS = 10_000;

type Props = {
  applicationId: string;
  initialStatus: string;
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

  // Phrase rotation — resets to 0 on phase change so the user always sees
  // the first phrase of the new pool first.
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
          setTimeout(() => {
            es.close();
            router.refresh();
          }, 600);
        } else {
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
  const phrase = phrasesForPhase(phase)[phraseIdx] ?? "";
  const now = PHASE_NOW[phase];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-dark2/60 backdrop-blur-sm">
      {/* Ambient glow tied to phase — sits behind everything else. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 360px at 50% -10%, var(--color-orange-glow), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(520px 260px at 50% 38%, var(--color-orange-subtle), transparent 70%)",
        }}
      />

      <div className="relative space-y-10 px-6 py-10 sm:px-10 sm:py-12">
        <StageIndicator stageIdx={stageIdx} />

        <div className="flex flex-col items-center gap-6">
          <DualRingSpinner glyph={now.glyph} />

          <div className="min-h-[68px] max-w-[520px] text-center">
            <p className="eyebrow-muted mb-2">Now happening</p>
            <p
              key={phrase}
              className="font-serif text-2xl font-light leading-snug text-text"
              style={{ animation: "live-fade-up 0.45s ease-out" }}
            >
              {phrase}
            </p>
          </div>

          <ProgressBar pct={progressPct} />

          <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {formatElapsed(elapsed)} elapsed
          </p>
        </div>

        <NowHappeningPanel bullets={now.bullets} stageLabel={STAGES[Math.max(0, stageIdx)]?.label ?? "Queued"} />

        <p className="text-center text-xs text-muted-foreground">
          You can leave this page — generation continues in the background.
          We'll keep this view in sync as long as you stay.
        </p>
      </div>

      <style jsx>{`
        @keyframes live-fade-up {
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
  // 4-col grid puts each stage in an equal-width column. The rail is
  // absolutely positioned behind, between the centres of the first and
  // last circles (12.5% to 87.5% of the container — the midpoints of
  // quarters 1 and 4). The active fill on the rail tweens with width.
  const fillPct =
    stageIdx <= 0
      ? 0
      : stageIdx >= STAGES.length - 1
        ? 100
        : (stageIdx / (STAGES.length - 1)) * 100;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute left-[12.5%] right-[12.5%] top-[14px] h-[2px] rounded-full bg-border"
      />
      <div
        aria-hidden
        className="absolute left-[12.5%] top-[14px] h-[2px] rounded-full bg-orange transition-[width] duration-700 ease-out"
        style={{ width: `calc((87.5% - 12.5%) * ${fillPct / 100})` }}
      />
      <ol className="relative grid grid-cols-4">
        {STAGES.map((stage, i) => {
          const done = stageIdx > i;
          const active = stageIdx === i;
          return (
            <li
              key={stage.key}
              className="flex flex-col items-center gap-2"
            >
              <span
                className={`relative flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-all duration-500 ${
                  done
                    ? "border-orange bg-orange text-white shadow-[0_0_18px_var(--color-orange-glow)]"
                    : active
                      ? "border-orange bg-orange-subtle text-orange shadow-[0_0_22px_var(--color-orange-glow)]"
                      : "border-border bg-dark text-muted-foreground"
                }`}
              >
                {done ? "✓" : i + 1}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-[-4px] animate-ping rounded-full border-2 border-orange/60"
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DualRingSpinner({ glyph }: { glyph: string }) {
  return (
    <div className="relative h-24 w-24">
      <span
        aria-hidden
        className="absolute inset-[-12px] rounded-full opacity-80"
        style={{
          background:
            "radial-gradient(circle, var(--color-orange-glow) 0%, transparent 70%)",
          animation: "live-pulse 2.6s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 rounded-full border-[3px] border-border"
        style={{
          borderTopColor: "var(--color-orange)",
          animation: "live-spin 1.05s linear infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-3 rounded-full border-2 border-border"
        style={{
          borderBottomColor: "var(--color-orange-light)",
          animation: "live-spin 1.6s linear infinite reverse",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-serif text-3xl font-light text-orange"
      >
        {glyph}
      </div>
      <style jsx>{`
        @keyframes live-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes live-pulse {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(1);
          }
          50% {
            opacity: 0.95;
            transform: scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-[3px] w-full max-w-[360px] overflow-hidden rounded-full bg-border"
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

function NowHappeningPanel({
  bullets,
  stageLabel,
}: {
  bullets: string[];
  stageLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-dark/60 p-5 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="eyebrow-muted">In this step</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-orange">
          {stageLabel}
        </p>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {bullets.map((b, i) => (
          <li
            key={`${stageLabel}-${i}`}
            className="flex items-start gap-2.5 text-sm leading-snug text-text/90"
            style={{
              animation: `live-fade-in 0.5s ease-out ${i * 80}ms both`,
            }}
          >
            <span
              aria-hidden
              className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <style jsx>{`
        @keyframes live-fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
