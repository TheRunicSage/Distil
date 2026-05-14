"use client";

// Title pill + on-hover/on-click reveal of "Distilled" — the
// tailoring-moves ledger that tells the user how their application
// was personalised.
//
// 2026-05-14 design pass ("Artisan's Ledger"): replaced the orange
// numbered 2-col grid with a single-column ledger of green-verified
// craft moves. Each row carries an emerald disc whose inner check
// path stroke-draws in on panel reveal, anchored by a thin orange
// rail that runs the length of the list. Header gains a Fraunces
// italic count tagline; footer carries a small italic signature.
// The semantic shift: "queued items" → "verified moves", driving
// confidence rather than information density.
//
// Why a client component (unchanged): panel can be tall, cursor
// needs to be able to leave the trigger and enter the panel without
// killing :hover, and click-to-pin gives touch + keyboard users a
// stable way in without forcing hover semantics they can't trigger.
//
// Behaviour (unchanged):
//   - mouseEnter on wrapper → open
//   - mouseLeave on wrapper → close (unless pinned)
//   - click title → toggle pinned
//   - Escape → close + unpin
//   - focus-within → open (keyboard a11y)
//   - outside mousedown while pinned → close

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SparklesIcon } from "lucide-react";

type Props = {
  // The role @ company markup. Kept as children so the server
  // component owns the styling decisions (brand orange on company
  // name, muted " @ " separator).
  children: ReactNode;
  // Numbered "tailoring moves" — what_we_did_checklist from the
  // success JSON. Rendered as a single-column ledger.
  tailoringMoves: string[];
};

export function BehindApplicationHover({ children, tailoringMoves }: Props) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const open = hovering || pinned;

  // Escape closes everything. Outside-click closes pinned state so
  // users can dismiss without finding the title again.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinned(false);
        setHovering(false);
      }
    }
    function onClick(e: MouseEvent) {
      if (!pinned) return;
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setPinned(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, pinned]);

  return (
    <div
      ref={wrapperRef}
      className="relative mx-auto w-fit"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(e) => {
        // Only close on focus leaving the wrapper entirely.
        if (
          !e.relatedTarget ||
          !wrapperRef.current?.contains(e.relatedTarget as Node)
        ) {
          setHovering(false);
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setPinned((p) => !p)}
        className={`group/title rounded-2xl border bg-dark2/85 px-7 py-3.5 text-center backdrop-blur-2xl transition-all duration-200 ${
          open
            ? "border-orange/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.36),0_0_48px_rgba(232,90,46,0.18)]"
            : "border-orange/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.32),0_0_36px_rgba(232,90,46,0.10)]"
        } cursor-pointer hover:border-orange/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40`}
      >
        {children}
      </button>

      {/* Persistent affordance caption — always visible regardless
          of popover state. */}
      <p
        aria-live="polite"
        className={`mt-2 text-center text-[11px] tracking-wide transition-colors duration-200 ${
          pinned
            ? "text-orange/85"
            : open
              ? "text-muted-foreground"
              : "text-muted-foreground/70"
        }`}
      >
        {pinned
          ? "Pinned — click title or press Esc to close"
          : "Hover for the tailoring notes · click to pin"}
      </p>

      {/* Panel — single-column ledger anchored below the title with
          no gap so cursor can move into it without crossing dead
          space. Narrower than the previous 2-col version (520px max)
          to read as a ledger rather than a dashboard. The corner-
          tucked orange + emerald ambient glows seed the brand-craft
          duality without competing with row content. */}
      <div
        role="dialog"
        aria-label="Distilled — tailoring moves"
        data-open={open}
        className={`absolute left-1/2 top-full z-50 mt-2 w-max min-w-[320px] max-w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-orange/25 bg-dark4/95 text-left shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(232,90,46,0.10)] backdrop-blur-2xl transition-[opacity,transform] duration-200 ease-out ${
          open
            ? "pointer-events-auto visible translate-y-0 opacity-100"
            : "pointer-events-none invisible translate-y-1 opacity-0"
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange/[0.10] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-emerald-500/[0.06] blur-3xl"
        />

        {/* Header — Distilled wordmark hosted in its own zone: a
            brand-orange tinted gradient wash + radial glow give
            the word a real backing instead of floating on the
            body surface. Centered for masthead presence; the
            ledger below is left-aligned, the contrast is the
            point. Border-orange seam ties the zone to the panel
            shell. */}
        <header className="relative overflow-hidden border-b border-orange/20 px-6 pb-5 pt-6">
          {/* Layered backing: vertical wash + soft radial glow
              above the wordmark. Both at low alpha — present but
              never competing with the word itself. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-orange/[0.10] via-orange/[0.04] to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-12 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-orange/[0.22] blur-3xl"
          />

          <h2 className="relative flex items-center justify-center gap-2.5 font-serif text-[24px] italic font-medium leading-none tracking-tight text-orange">
            <SparklesIcon
              size={16}
              aria-hidden
              strokeWidth={1.6}
              className="text-orange/85"
            />
            <span className="distilled-wordmark">Distilled</span>
          </h2>
        </header>

        {/* Ledger — single-column rail of verified moves. */}
        <ol className="distilled-ledger relative px-6 pb-5 pt-4">
          {/* Vertical orange hairline rail behind the disc column —
              reads as a "thread of craft" running through the list.
              Gradient fade at top/bottom masks any imprecision in
              first/last disc alignment. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-6 bottom-6 w-px bg-gradient-to-b from-orange/0 via-orange/35 to-orange/0"
            style={{ left: "calc(1.5rem + 11px)" }}
          />

          {tailoringMoves.map((item, i) => (
            <li
              key={i}
              className="distilled-row group/move relative flex items-start gap-3.5 py-2 text-[13.5px] leading-snug text-text/85 transition-colors hover:text-text"
              style={{ ["--row-delay" as string]: `${i * 70}ms` }}
            >
              {/* Verified disc. Emerald-500 fill with a white
                  check, ring + glow intensify on row hover. The
                  inner check stroke draws itself in on reveal via
                  stroke-dash animation, delayed 140ms behind the
                  row's own fade-in for a satisfying one-two beat. */}
              <span
                aria-hidden
                className="relative mt-px inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.4),0_4px_10px_rgba(16,185,129,0.18)] transition-all duration-200 group-hover/move:bg-emerald-400 group-hover/move:shadow-[0_0_0_1px_rgba(52,211,153,0.55),0_0_16px_rgba(52,211,153,0.45)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3"
                  fill="none"
                  stroke="white"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path
                    d="M4.5 12.5 L10 18 L19.5 7"
                    className="distilled-check-path"
                  />
                </svg>
              </span>

              <span className="pt-[1px]">{item}</span>
            </li>
          ))}
        </ol>

        {/* Signature flourish — quiet italic right-aligned line
            tying the panel off as a craftsman's note. Tiny on
            purpose; the discs and tagline are the leads. */}
        <p className="relative border-t border-border/60 px-6 py-3 text-right font-serif text-[11px] italic text-muted-foreground">
          — Tailored by Distil
        </p>
      </div>

      {/* Scoped keyframes for the row stagger + check-draw reveal.
          Unique `distilled-*` prefix avoids collisions with the
          live-view's `live-*` keyframes per the existing convention.
          prefers-reduced-motion drops all animation and shows the
          content at rest. */}
      <style>{`
        .distilled-wordmark {
          text-shadow: 0 0 24px rgba(232, 90, 46, 0.32);
        }
        .distilled-row {
          opacity: 0;
          transform: translateY(4px);
        }
        [data-open="true"] .distilled-row {
          animation: distilled-row-in 360ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          animation-delay: var(--row-delay, 0ms);
        }
        @keyframes distilled-row-in {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .distilled-check-path {
          stroke-dasharray: 28;
          stroke-dashoffset: 28;
        }
        [data-open="true"] .distilled-check-path {
          animation: distilled-check-draw 420ms cubic-bezier(0.65, 0, 0.35, 1) forwards;
          animation-delay: calc(var(--row-delay, 0ms) + 140ms);
        }
        @keyframes distilled-check-draw {
          to {
            stroke-dashoffset: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .distilled-row,
          .distilled-check-path {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            stroke-dashoffset: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
