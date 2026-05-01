"use client";

// Site-wide ambient dot field with a cushioned cursor halo. Sits fixed
// behind content (z-1, above AmbientBackground blobs at z-0, below the
// z-10 content layer).
//
// Behaviour (2026-05-01 redesign):
//   - Dots at rest are softly visible (REST_OPACITY = 0.22) so the grid
//     reads as part of the surface, not a "did the page even load" trick.
//   - Within RANGE_PX of the cursor, dots brighten, grow slightly, and
//     push away. Falloff is smoothstep (cubic ease) rather than linear,
//     so the influence eases in gently and tapers off at the edge —
//     the "cushioned" feel.
//   - Dot displacement and opacity lerp toward target each frame
//     (LERP_FACTOR = 0.18), so dots ease back to rest after the cursor
//     leaves rather than snapping.
//   - A soft orange cursor halo (radial-gradient div) follows the mouse
//     with the same lerp easing — the visible centre of the field.
//
// Self-contained: owns its RAF, mousemove listener, and matchMedia
// gates. No dependency on the landing-page MotionRoot, so this
// component can mount on any layout (landing, (app), (auth)) and
// behave the same.
//
// Performance budget:
//   - One mousemove listener (RAF-throttled)
//   - One requestAnimationFrame loop
//   - DOT_CAP DOM writes per frame (~360); cushioned animation means
//     every dot is touched every frame, but at 360 circles that's well
//     within budget on any modern desktop.
//   - Auto-disabled on touch / prefers-reduced-motion / viewport <1024px

import { useEffect, useMemo, useRef, useState } from "react";

const CELL_PX = 80;
const DOT_R = 1.7;
const REST_OPACITY = 0.22;
const ACTIVE_OPACITY = 0.7;
const RANGE_PX = 220;
const MAX_PUSH_PX = 18;
const MAX_GROW = 1.6; // active dots scale up to 1.6x rest size
const LERP_FACTOR = 0.18; // cushion factor — smaller = softer return
const HALO_SIZE_PX = 360; // soft glow that follows the cursor
const DOT_CAP = 400;

type Dot = { cx: number; cy: number };
type DotState = { ox: number; oy: number; opacity: number; scale: number };

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

// smoothstep — cubic ease curve, 0..1 → 0..1 with eased shoulders.
// Gives the proximity falloff a cushioned feel rather than a linear ramp.
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function MagneticDots() {
  const [enabled, setEnabled] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const dotStateRef = useRef<DotState[]>([]);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -10000,
    y: -10000,
    active: false,
  });
  const haloPosRef = useRef<{ x: number; y: number }>({ x: -10000, y: -10000 });
  const haloRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

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

  // Keep the dot grid sized to the viewport.
  useEffect(() => {
    function measure() {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const dots = useMemo(() => buildDots(size.w, size.h), [size.w, size.h]);

  // Trim stale refs / states when the grid shrinks.
  useEffect(() => {
    dotRefs.current = dotRefs.current.slice(0, dots.length);
    dotStateRef.current = dotStateRef.current.slice(0, dots.length);
  }, [dots.length]);

  useEffect(() => {
    if (!enabled) return;

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    }
    function onMouseLeave() {
      mouseRef.current = { x: -10000, y: -10000, active: false };
    }

    function tick() {
      const { x: mx, y: my, active } = mouseRef.current;
      const refs = dotRefs.current;
      const states = dotStateRef.current;

      // Lerp the halo toward the mouse — same cushioning as the dots,
      // so the visible halo eases into place rather than snapping.
      haloPosRef.current.x +=
        (mx - haloPosRef.current.x) * LERP_FACTOR;
      haloPosRef.current.y +=
        (my - haloPosRef.current.y) * LERP_FACTOR;
      if (haloRef.current) {
        const hx = haloPosRef.current.x - HALO_SIZE_PX / 2;
        const hy = haloPosRef.current.y - HALO_SIZE_PX / 2;
        haloRef.current.style.transform = `translate3d(${hx.toFixed(
          1,
        )}px, ${hy.toFixed(1)}px, 0)`;
        haloRef.current.style.opacity = active ? "1" : "0";
      }

      for (let i = 0; i < refs.length; i++) {
        const el = refs[i];
        const dot = dots[i];
        if (!el || !dot) continue;

        let targetOx = 0;
        let targetOy = 0;
        let targetOp = REST_OPACITY;
        let targetScale = 1;

        if (active) {
          const dx = mx - dot.cx;
          const dy = my - dot.cy;
          const dist = Math.hypot(dx, dy);
          if (dist <= RANGE_PX) {
            const t = 1 - dist / RANGE_PX;
            const factor = smoothstep(t);
            const len = dist || 1;
            targetOx = -(dx / len) * MAX_PUSH_PX * factor;
            targetOy = -(dy / len) * MAX_PUSH_PX * factor;
            targetOp =
              REST_OPACITY + (ACTIVE_OPACITY - REST_OPACITY) * factor;
            targetScale = 1 + (MAX_GROW - 1) * factor;
          }
        }

        let s = states[i];
        if (!s) {
          s = { ox: 0, oy: 0, opacity: REST_OPACITY, scale: 1 };
          states[i] = s;
        }
        s.ox += (targetOx - s.ox) * LERP_FACTOR;
        s.oy += (targetOy - s.oy) * LERP_FACTOR;
        s.opacity += (targetOp - s.opacity) * LERP_FACTOR;
        s.scale += (targetScale - s.scale) * LERP_FACTOR;

        el.style.transform = `translate(${s.ox.toFixed(
          2,
        )}px, ${s.oy.toFixed(2)}px) scale(${s.scale.toFixed(3)})`;
        el.style.opacity = s.opacity.toFixed(3);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
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
      dotStateRef.current = [];
      if (haloRef.current) haloRef.current.style.opacity = "0";
    };
  }, [enabled, dots]);

  if (size.w === 0 || size.h === 0) return null;

  return (
    <>
      {/* Soft cursor halo — the visible centre of the field. Renders as
          a radial-gradient that fades to transparent. transform-only
          updates each frame keep it on the GPU compositor. */}
      <div
        ref={haloRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: HALO_SIZE_PX,
          height: HALO_SIZE_PX,
          pointerEvents: "none",
          background:
            "radial-gradient(circle, var(--color-orange-glow) 0%, var(--color-orange-subtle) 35%, transparent 70%)",
          opacity: 0,
          transition: "opacity 0.3s ease-out",
          mixBlendMode: "screen",
          willChange: "transform, opacity",
          zIndex: 1,
        }}
      />
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
            style={{ transformOrigin: `${dot.cx}px ${dot.cy}px` }}
          />
        ))}
      </svg>
    </>
  );
}
