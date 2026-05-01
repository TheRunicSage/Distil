"use client";

// Dot + slow-follow ring cursor. CSS transforms only, no canvas, no
// per-frame layout reads. The dot snaps directly to the cursor; the
// ring lerps toward it for a soft trailing feel.
//
// When cursorEnabled is false (touch device, reduced-motion, viewport
// <1024px) the component renders nothing and leaves the native cursor
// alone. When it IS active, it adds .cursor-none to <body> so the
// native cursor disappears site-wide on this page.

import { useEffect, useRef } from "react";
import { useMotion } from "./MotionRoot";

const RING_LERP = 0.18; // 0..1 — higher = tighter follow

export function CustomCursor() {
  const { cursorEnabled, subscribe } = useMotion();
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const ringPosRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });

  useEffect(() => {
    if (!cursorEnabled) return;
    document.body.classList.add("cursor-none");
    return () => {
      document.body.classList.remove("cursor-none");
    };
  }, [cursorEnabled]);

  useEffect(() => {
    if (!cursorEnabled) return;
    const unsubscribe = subscribe(({ mouseX, mouseY }) => {
      const dot = dotRef.current;
      const ring = ringRef.current;
      if (!dot || !ring) return;

      // Dot snaps to cursor.
      dot.style.transform = `translate3d(${mouseX - 3}px, ${mouseY - 3}px, 0)`;

      // Ring eases toward the cursor.
      const pos = ringPosRef.current;
      pos.x += (mouseX - pos.x) * RING_LERP;
      pos.y += (mouseY - pos.y) * RING_LERP;
      ring.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    });
    return unsubscribe;
  }, [cursorEnabled, subscribe]);

  if (!cursorEnabled) return null;

  return (
    <>
      <div ref={dotRef} className="landing-cursor landing-cursor-dot" aria-hidden />
      <div ref={ringRef} className="landing-cursor landing-cursor-ring" aria-hidden />
    </>
  );
}
