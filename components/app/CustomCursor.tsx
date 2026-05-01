"use client";

// Site-wide dot + ring cursor. Self-contained (own RAF, mousemove,
// matchMedia gates) so it can mount on any layout — the landing page,
// the (app) shell, the (auth) shell — without depending on the
// landing-only MotionRoot.
//
// Auto-disabled on touch / prefers-reduced-motion / viewport <1024px.
// When disabled the component renders nothing and leaves the native
// cursor alone. When active, it adds .cursor-none to <body> so the
// native arrow disappears for the duration.
//
// CSS hooks live in app/globals.css under the .landing-cursor* selectors
// (the class names predate this move; they stay landing-prefixed to
// avoid a CSS rename churn but are now used everywhere).

import { useEffect, useRef, useState } from "react";

const RING_LERP = 0.18;

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
  const ringPosRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const noHover = window.matchMedia("(hover: none)");
    function recompute() {
      setEnabled(wide.matches && !reduced.matches && !noHover.matches);
    }
    recompute();
    wide.addEventListener("change", recompute);
    reduced.addEventListener("change", recompute);
    noHover.addEventListener("change", recompute);
    return () => {
      wide.removeEventListener("change", recompute);
      reduced.removeEventListener("change", recompute);
      noHover.removeEventListener("change", recompute);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add("cursor-none");
    return () => {
      document.body.classList.remove("cursor-none");
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }

    function tick() {
      const { x: mx, y: my } = mouseRef.current;
      const dot = dotRef.current;
      const ring = ringRef.current;
      if (dot) {
        dot.style.transform = `translate3d(${mx - 3}px, ${my - 3}px, 0)`;
      }
      if (ring) {
        const pos = ringPosRef.current;
        pos.x += (mx - pos.x) * RING_LERP;
        pos.y += (my - pos.y) * RING_LERP;
        ring.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div ref={dotRef} className="landing-cursor landing-cursor-dot" aria-hidden />
      <div ref={ringRef} className="landing-cursor landing-cursor-ring" aria-hidden />
    </>
  );
}
