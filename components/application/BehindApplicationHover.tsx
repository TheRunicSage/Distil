"use client";

// Title pill + on-hover/on-click reveal of "What we did" — the
// tailoring-moves checklist that tells the user how the model
// personalised their application. 2026-05-13 v2: pared back from
// the earlier multi-section panel (fit reasoning + warnings +
// moves) to just the moves. Fit data has its own dedicated home
// in the Fit pill hover; this panel is now single-purpose so the
// reader's eye lands on one thing.
//
// Why a client component and not a CSS-only HoverHint:
//   - Panel content can be tall (5-7 numbered moves).
//   - With CSS-only hover on a `.group` whose bounding box is the
//     trigger, cursor leaving the trigger to read the popover kills
//     :hover. We want the panel to stay open while cursor is over
//     either the title OR the panel — that requires a wrapping
//     onMouseLeave handler.
//   - Click-to-pin gives touch + keyboard users a stable way in
//     without forcing hover semantics they can't trigger.
//
// Behaviour:
//   - mouseEnter on wrapper → open
//   - mouseLeave on wrapper → close (unless pinned)
//   - click title → toggle pinned
//   - Escape → close + unpin
//   - focus-within → open (keyboard a11y)
//
// Style notes (2026-05-13 design-first pass):
//   - Eyebrow + sparkles in brand orange — small, restrained.
//   - One-line serif-italic tagline below the eyebrow gives the
//     panel a human-readable purpose without dominating space.
//   - Numbered chips are the visual hero: gradient orange fill,
//     brand-ring at rest, slight scale + brighter glow on item
//     hover. Larger than the previous version (size-7 vs size-5)
//     to balance the now-shorter panel.
//   - 2-col grid on sm+, 1-col on mobile. items-start keeps wrapped
//     lines lined up against their number.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SparklesIcon } from "lucide-react";

type Props = {
  // The role @ company markup. Kept as children so the server
  // component owns the styling decisions (brand orange on company
  // name, muted " @ " separator).
  children: ReactNode;
  // Numbered "tailoring moves" — what_we_did_checklist from the
  // success JSON. Rendered as a 2-col grid on sm+ viewports.
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

      {/* Panel — anchored below the title, no gap so cursor can move
          into it without crossing dead space. Width clamped at min
          of 640px and the viewport (minus a 2rem safety gutter). The
          corner-tucked brand-orange ambient glow ties the panel to
          the rest of the success view's brand language without
          competing with the numbered chips for attention. */}
      <div
        role="dialog"
        aria-label="What we did"
        className={`absolute left-1/2 top-full z-50 mt-2 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-orange/25 bg-dark4/95 p-6 text-left shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(232,90,46,0.10)] backdrop-blur-2xl transition-[opacity,transform] duration-200 ease-out ${
          open
            ? "pointer-events-auto visible translate-y-0 opacity-100"
            : "pointer-events-none invisible translate-y-1 opacity-0"
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange/[0.08] blur-3xl"
        />

        {/* Single eyebrow, no tagline, no counter — the brand pun is
            the headline and the list does the rest. */}
        <p className="relative eyebrow flex items-center gap-1.5">
          <SparklesIcon size={12} aria-hidden className="text-orange" />
          Distilled
        </p>

        <ul className="relative mt-4 grid grid-cols-1 items-start gap-x-5 gap-y-2.5 sm:grid-cols-2">
          {tailoringMoves.map((item, i) => (
            <li
              key={i}
              className="group/move flex items-start gap-2.5 text-[13px] leading-snug text-text/90 transition-colors hover:text-text"
            >
              <span
                aria-hidden
                className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-orange/40 to-orange/15 text-[11px] font-bold text-orange shadow-sm ring-1 ring-orange/30 transition-all duration-200 group-hover/move:scale-110 group-hover/move:from-orange/55 group-hover/move:to-orange/25 group-hover/move:shadow-[0_0_14px_rgba(232,90,46,0.4)]"
              >
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
