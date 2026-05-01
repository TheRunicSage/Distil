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
//   - "Did you know" rotating tip carousel
//
// Phrase pools are sized so a 2-minute wait does not loop visibly:
// research has 28 phrases at 3.2s each (~90s before repeat), and the
// hero phrase + tip carousel rotate on independent timers so the screen
// keeps changing.

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
  "Reading between the lines of your experience",
  "Identifying the hiring company",
  "Searching the web for company signals",
  "Reading mission, values, and recent news",
  "Decoding what recruiters actually want",
  "Checking current ATS best practices",
  "Pinpointing must-haves vs nice-to-haves",
  "Calibrating to the right seniority",
  "Surfacing the company's recent press",
  "Triangulating salary signals from NZ sources",
  "Mapping the role's day-to-day toolkit",
  "Looking for projects you can connect with",
  "Cross-referencing your CV against the JD",
  "Hunting for the strongest matching evidence",
  "Identifying gaps worth bridging honestly",
  "Reading the company's engineering blog",
  "Filtering out boilerplate from the JD",
  "Listening for the role's real centre of gravity",
  "Spotting the values the JD emphasises",
  "Pulling out the must-mirror ATS keywords",
  "Reading recent leadership and team changes",
  "Connecting your experience to the team's mission",
  "Weighing scope, ownership, and trajectory",
  "Building the opening hook for your cover letter",
  "Drafting the story paragraph in your head first",
  "Choosing where confidence beats keyword stuffing",
  "Triangulating company size and stage",
  "Checking the public sector flag for Te Tiriti",
];

const GENERATION_PHRASES = [
  "Mapping your strengths to the role",
  "Cutting through the noise",
  "Crafting your narrative",
  "Choosing bullets that earn their place",
  "Tailoring every word to this role",
  "Re-ordering technical skills by relevance",
  "Bridging gaps with honest, growth-oriented language",
  "Picking the one specific story for paragraph 2",
];

const RENDER_PHRASES = [
  "Rendering ATS-safe documents",
  "Setting margins, polishing typography",
  "Applying the dense layout for two-page fit",
  "Branding the contact rule in Curiosum orange",
];

const WRAP_PHRASES = [
  "Final quality scan",
  "Storing your tailored CV and cover letter",
  "Computing the fit score",
  "Building your what-we-did checklist",
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
      "Reserved your queue slot",
      "Waiting for the previous run to finish",
      "Concurrency is capped at one per user",
      "We'll start as soon as the slot opens",
    ],
  },
  llm_started: {
    glyph: "?",
    bullets: [
      "Researching the company live on the web",
      "Pulling recent news from the last 12 months",
      "Decoding the JD's must-haves and ATS keywords",
      "Mapping your CV against the role's centre of gravity",
    ],
  },
  llm_completed: {
    glyph: "✎",
    bullets: [
      "Drafting the tailored profile and bullets",
      "Picking the one specific story for paragraph 2",
      "Reordering skills by relevance to the role",
      "Calibrating length to your seniority",
    ],
  },
  rendering_started: {
    glyph: "▤",
    bullets: [
      "Generating the ATS-safe CV in DOCX",
      "Building the cover letter with brand-orange contact rule",
      "Applying Calibri at the dense profile sizes",
      "Uploading both files to private storage",
    ],
  },
  finalized: {
    glyph: "✓",
    bullets: [
      "Running the quality scan",
      "Computing your fit score and warnings",
      "Building the what-we-did checklist",
      "Releasing the download buttons",
    ],
  },
};

// Did-you-know carousel — these rotate on a 6.5s independent timer so
// the page is showing two streams of fresh copy at once. Educational,
// product-confident, and grounded in real behaviour the model performs.
const DID_YOU_KNOW: string[] = [
  "We never invent dates, employers, or numbers — every claim ties back to your master CV.",
  "Each cover letter references a real, verifiable thing about the company found via live web search.",
  "The system bans em dashes and a list of AI-tell phrases; a server-side scanner flags any survivors.",
  "We mirror 8–12 ATS keywords from the job description naturally — no keyword stuffing.",
  "Your master CV stays in private storage. Only the service-role key can read it.",
  "Files expire after 60 days; we keep generation metadata for a year for your records.",
  "If we can't proceed, the queue advances on its own — you never wait behind a stuck row.",
  "Cover letters target 320–380 words across exactly four paragraphs, calibrated to your seniority.",
  "Graduate CVs use a denser layout to land on two pages without crowding.",
  "The fit score is honest internal metadata — a weak score never blocks delivery.",
  "Public-sector applications get a tailored Te Tiriti acknowledgement, only when your CV supports it.",
  "Salary band research pulls from Hays, Robert Walters, Seek, and Trade Me Jobs.",
  "We cap each generation at $1.00 — a pre-call estimate gates anything that would exceed it.",
  "The system prompt is cached, so back-to-back retries cost a fraction of the first run.",
  "If the LLM trips a schema cap, we log the exact field path so we can fix it the same day.",
];

const PHRASE_INTERVAL_MS = 3200;
const TIP_INTERVAL_MS = 6500;
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
  const [tipIdx, setTipIdx] = useState(() =>
    Math.floor(Math.random() * DID_YOU_KNOW.length),
  );
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

  // Tip rotation — independent timer so the page has two streams of
  // fresh copy. Doesn't reset on phase change.
  useEffect(() => {
    const tick = setInterval(() => {
      setTipIdx((i) => (i + 1) % DID_YOU_KNOW.length);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

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
  const tip = DID_YOU_KNOW[tipIdx];

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
            {formatElapsed(elapsed)} elapsed · typically 1m 30s to 2m
          </p>
        </div>

        <NowHappeningPanel bullets={now.bullets} stageLabel={STAGES[Math.max(0, stageIdx)]?.label ?? "Queued"} />

        <DidYouKnow tip={tip} index={tipIdx} />

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

function DidYouKnow({ tip, index }: { tip: string; index: number }) {
  return (
    <div className="rounded-2xl border border-orange/20 bg-orange-subtle px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange/15 font-serif text-[13px] italic text-orange"
        >
          i
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-muted mb-1">Did you know</p>
          <p
            key={index}
            className="text-sm leading-relaxed text-text/90"
            style={{ animation: "live-tip 0.45s ease-out" }}
          >
            {tip}
          </p>
        </div>
      </div>
      <style jsx>{`
        @keyframes live-tip {
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
