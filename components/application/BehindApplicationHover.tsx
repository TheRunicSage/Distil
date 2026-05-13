"use client";

// Title pill + on-hover/on-click reveal of "Behind this application" —
// the consolidated panel that holds fit reasoning, warnings, and the
// numbered "what we did" tailoring moves. Replaces the previous
// standalone surface-card on the success view per user request
// (2026-05-13): the title becomes the affordance; the panel appears
// beneath on hover (mouse) or click (touch / keyboard).
//
// Why a client component and not a CSS-only HoverHint:
//   - Panel content is too tall for the 288px HoverHint pattern
//     (fit reasoning quote + warnings chips + 5-7 numbered moves).
//   - With CSS-only hover on a `.group` whose bounding box is the
//     trigger, cursor leaving the trigger to read the popover kills
//     :hover. We want the panel to stay open while cursor is over
//     either the title OR the panel — that requires a wrapping
//     onMouseLeave handler.
//   - Click-to-pin gives touch users + keyboard users a stable way
//     in, without forcing hover semantics they can't trigger.
//
// Behaviour:
//   - mouseEnter on wrapper → open
//   - mouseLeave on wrapper → close (unless pinned)
//   - click title → toggle pinned
//   - Escape → close + unpin
//   - focus-within → open (keyboard a11y)

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SparklesIcon } from "lucide-react";

type Props = {
  // The role @ company markup. Kept as children so the server
  // component owns the styling decisions (brand orange on company
  // name, muted " @ " separator).
  children: ReactNode;
  // Fit assessment reasoning — serif italic quote with brand left
  // rule, the verdict-style hero of the panel.
  fitReasoning: string;
  // Optional honesty-flag chips. Zero-length array hides the row.
  warnings: string[];
  // Numbered "tailoring moves" — what_we_did_checklist from the
  // success JSON. Rendered as a 2-col grid on sm+ viewports.
  tailoringMoves: string[];
};

export function BehindApplicationHover({
  children,
  fitReasoning,
  warnings,
  tailoringMoves,
}: Props) {
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
        // Only close on focus leaving the wrapper entirely. relatedTarget
        // is the element receiving focus; if it's still inside, keep open.
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

      {/* Panel — anchored below the title, no gap so cursor can move
          into it without crossing dead space. Width clamped at min of
          640px and the viewport (minus a 2rem safety gutter) so it
          stays readable on narrow screens. */}
      <div
        role="dialog"
        aria-label="Behind this application"
        className={`absolute left-1/2 top-full z-50 mt-2 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-orange/25 bg-dark4/95 p-6 text-left shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(232,90,46,0.10)] backdrop-blur-2xl transition-[opacity,transform] duration-200 ease-out ${
          open
            ? "pointer-events-auto visible translate-y-0 opacity-100"
            : "pointer-events-none invisible translate-y-1 opacity-0"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow flex items-center gap-1.5">
            <SparklesIcon size={12} aria-hidden className="text-orange" />
            Behind this application
          </p>
          <span className="text-xs text-muted-foreground">
            {tailoringMoves.length}{" "}
            {tailoringMoves.length === 1 ? "move" : "moves"}
          </span>
        </div>

        {/* Hero verdict — serif italic with brand left rule. Slightly
            smaller than the standalone-card version so the popover
            stays compact. */}
        <blockquote className="mt-4 border-l-2 border-orange/60 pl-4">
          <p className="font-serif text-base italic leading-relaxed text-text sm:text-lg">
            {fitReasoning}
          </p>
        </blockquote>

        {warnings.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {warnings.map((w, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs text-warn"
              >
                <span aria-hidden className="size-1 rounded-full bg-warn" />
                {w}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-xl bg-orange/[0.05] p-4 ring-1 ring-orange/15">
          <p className="eyebrow-muted">Tailoring moves</p>
          <ul className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
            {tailoringMoves.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-text/90"
              >
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-orange/35 to-orange/15 text-[10px] font-bold text-orange ring-1 ring-orange/30"
                >
                  {i + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          {pinned
            ? "Click the title again or press Esc to close."
            : "Click to keep open."}
        </p>
      </div>
    </div>
  );
}
