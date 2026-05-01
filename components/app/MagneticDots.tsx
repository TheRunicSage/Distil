"use client";

// Site-wide ambient dot field. Sits fixed behind content (z-1, above
// AmbientBackground blobs at z-0, below the z-10 content layer). Dots
// at rest are nearly invisible; within ~150px of the cursor they
// brighten and push away in the cursor-to-dot direction. The
// interaction is gentle — the system reads as alive but never as a
// game element.
//
// Self-contained: owns its RAF, mousemove listener, and matchMedia
// gates. No dependency on the landing-page MotionRoot, so this
// component can mount on any layout (landing, (app), (auth)) and
// behave the same.
//
// Performance budget:
//   - One mousemove listener (RAF-throttled)
//   - One requestAnimationFrame loop
//   - DOT_CAP DOM writes per frame max (~300)
//   - Auto-disabled on touch / prefers-reduced-motion / viewport <1024px

import { useEffect, useMemo, useRef, useState } from "react";

const CELL_PX = 80;
const DOT_R = 1.5;
const REST_OPACITY = 0.14;
const ACTIVE_OPACITY = 0.55;
const RANGE_PX = 150;
const MAX_PUSH_PX = 14;
const DOT_CAP = 360;

type Dot = { cx: number; cy: number };

function buildDots(width: number, height: number): Dot[] {
  if (width <= 0 || height <= 0) return [];
  const cols = Math.max(2, Math.floor(width / CELL_PX));
  const rows = Math.max(2, Math.floor(height / CELL_PX));
  const stepX = width / cols;
  const stepY = height / rows;
  const dots: Dot[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      dots.push({
        cx: stepX * c,
        cy: stepY * r,
      });
      if (dots.length >= DOT_CAP) return dots;
    }
  }
  return dots;
}

export function MagneticDots() {
  const [enabled, setEnabled] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -10000, y: -10000 });
  const rafRef = useRef<number | null>(null);
  const lastTouchedRef = useRef<Set<number>>(new Set());

  // Gate motion on viewport width + reduced-motion. Touch devices fall
  // back to the static rest state — no cursor proximity, but the dots
  // are still rendered for visual depth.
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

  // Keep the dot grid sized to the viewport. Updates on resize; uses
  // window dimensions (not container) since the SVG is fixed-position
  // covering the viewport.
  useEffect(() => {
    function measure() {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const dots = useMemo(() => buildDots(size.w, size.h), [size.w, size.h]);

  // Trim stale refs when the grid shrinks.
  useEffect(() => {
    dotRefs.current = dotRefs.current.slice(0, dots.length);
  }, [dots.length]);

  useEffect(() => {
    if (!enabled) return;

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }

    function tick() {
      const { x: mx, y: my } = mouseRef.current;
      const refs = dotRefs.current;
      const touched = lastTouchedRef.current;
      const newTouched = new Set<number>();

      for (let i = 0; i < refs.length; i++) {
        const el = refs[i];
        const dot = dots[i];
        if (!el || !dot) continue;
        const dx = mx - dot.cx;
        const dy = my - dot.cy;
        const dist = Math.hypot(dx, dy);
        if (dist > RANGE_PX) continue;
        const factor = 1 - dist / RANGE_PX;
        const len = dist || 1;
        // Push away (negate the direction-to-cursor vector).
        const ox = -(dx / len) * MAX_PUSH_PX * factor;
        const oy = -(dy / len) * MAX_PUSH_PX * factor;
        el.style.transform = `translate(${ox}px, ${oy}px)`;
        el.style.opacity = String(REST_OPACITY + (ACTIVE_OPACITY - REST_OPACITY) * factor);
        newTouched.add(i);
      }

      // Reset any dots that were animated last frame but are now out of
      // range — keeps the rest state genuinely at rest, no stuck offsets.
      for (const i of touched) {
        if (newTouched.has(i)) continue;
        const el = refs[i];
        if (!el) continue;
        el.style.transform = "";
        el.style.opacity = String(REST_OPACITY);
      }
      lastTouchedRef.current = newTouched;

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
      // Reset all dots so re-enabling later starts clean.
      for (const el of dotRefs.current) {
        if (el) {
          el.style.transform = "";
          el.style.opacity = String(REST_OPACITY);
        }
      }
      lastTouchedRef.current.clear();
    };
  }, [enabled, dots]);

  if (size.w === 0 || size.h === 0) return null;

  return (
    <svg
      aria-hidden
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {dots.map((dot, i) => (
        <circle
          key={i}
          ref={(el) => {
            dotRefs.current[i] = el;
          }}
          cx={dot.cx}
          cy={dot.cy}
          r={DOT_R}
          fill="var(--color-orange)"
          opacity={REST_OPACITY}
          style={{ transition: "opacity 0.4s ease-out" }}
        />
      ))}
    </svg>
  );
}
