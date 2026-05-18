"use client";

// Mouse-position-aware micro-tilt wrapper. Attaches a perspective +
// rotateX/rotateY transform to the child driven by --mx / --my CSS
// variables that track the cursor position within the wrapper's
// bounds. Tilt is small (max 1.5deg) so the effect reads as warm
// depth, not chaos. Returns to flat on mouse leave with the
// transition declared on the child by globals.css `.tilt-wrap > *`.
//
// Gated on:
//   - prefers-reduced-motion: no-preference (motion accessibility)
//   - hover: hover (skip on touch — synthetic hover would stick the
//     tilt state until next interaction)
//   Both checked at mount via matchMedia. Disabled wrappers fall
//   through with --mx/--my pinned at 0deg so the child renders flat
//   with no transform overhead.
//
// Used by ApplicationLiveView (the waiting-screen progress card).
// Applicable to any rectangular surface where a "designed product"
// feel beats a "list of rows" feel.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Maximum tilt magnitude in degrees. Default 1.5deg keeps the
   *  effect subliminal — bigger feels like a toy. */
  maxDeg?: number;
};

export function TiltWrap({ children, className = "", maxDeg = 1.5 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(false);
  // Pending tilt target, drained on the next animation frame.
  // mousemove can fire 5+ times per frame on a 165Hz device; without
  // RAF coalescing each event would trigger a style recalc plus a
  // bounding-rect read, both main-thread work. With RAF coalescing the
  // wrapper writes its CSS custom properties at most once per frame.
  const targetRef = useRef<{ mx: number; my: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const motionOK = window.matchMedia(
      "(prefers-reduced-motion: no-preference)",
    ).matches;
    const hoverOK = window.matchMedia("(hover: hover)").matches;
    setEnabled(motionOK && hoverOK);
  }, []);

  // Cancel any pending frame on unmount so the RAF doesn't fire after
  // the wrapper has been torn down.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  function flush() {
    rafRef.current = null;
    const pending = targetRef.current;
    if (!pending || !ref.current) return;
    ref.current.style.setProperty("--mx", `${pending.mx.toFixed(2)}deg`);
    ref.current.style.setProperty("--my", `${pending.my.toFixed(2)}deg`);
  }

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!enabled) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0..1, left→right
    const y = (e.clientY - rect.top) / rect.height; // 0..1, top→bottom
    // rotateY: cursor on the right tilts the right edge away.
    // rotateX: cursor on the top tilts the top edge toward the viewer.
    targetRef.current = {
      mx: (x - 0.5) * 2 * maxDeg,
      my: (0.5 - y) * 2 * maxDeg,
    };
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush);
    }
  }

  function handleLeave(e: React.MouseEvent<HTMLDivElement>) {
    targetRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    e.currentTarget.style.setProperty("--mx", "0deg");
    e.currentTarget.style.setProperty("--my", "0deg");
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`tilt-wrap${className ? " " + className : ""}`}
      style={{ "--mx": "0deg", "--my": "0deg" } as CSSProperties}
    >
      {children}
    </div>
  );
}
