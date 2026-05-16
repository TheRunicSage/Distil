"use client";

// Site-wide ambient dot field with a cushioned cursor halo. Sits fixed
// behind content (z-1, above AmbientBackground blobs at z-0, below the
// z-10 content layer).
//
// Rendering: a single <canvas> covers the viewport and draws all dots
// plus the cursor halo in one paint per frame. Previous SVG version
// (~1600-2200 <circle> nodes with per-frame inline style mutations) was
// fine at 60Hz but pinned compositors at 30fps on 165Hz displays — the
// per-node style writes triggered SVG repaints across overlapping dirty
// regions every frame the cursor moved. Canvas drops the DOM cost to
// zero and gives the compositor one cheap layer.
//
// Behaviour preserved from the SVG version:
//   - Dots at rest at REST_OPACITY (theme-conditioned).
//   - Within RANGE_PX of the cursor, dots brighten, grow, and push away
//     with a smoothstep falloff (cushioned, not linear).
//   - Per-frame lerp at LERP_FACTOR toward each dot's target state, so
//     dots ease back to rest after the cursor leaves.
//   - A soft orange halo follows the cursor with the same lerp, drawn
//     as a radial gradient on the same canvas (no separate DOM node,
//     no mix-blend-mode).
//   - Theme-aware via MutationObserver on documentElement.classList.
//   - Auto-disabled on touch / prefers-reduced-motion / viewport <1024px.

import { useEffect, useRef, useState } from "react";

// Density + dynamism (carried over from the SVG version):
//   CELL_PX 36 — ~1600 dots on a 1920x1080 viewport
//   DOT_CAP 2200 — hard ceiling regardless of viewport size
//   LERP_FACTOR 0.20 — responsive without being twitchy
const CELL_PX = 36;
const DOT_R = 1.7;
const RANGE_PX = 230;
const RANGE_CULL_PX = RANGE_PX + 60;
const REST_EPSILON = 0.05;
const MAX_PUSH_PX = 16;
const MAX_GROW = 1.6;
const LERP_FACTOR = 0.2;
const HALO_SIZE_PX = 280;
const DOT_CAP = 2200;

// Brand orange — rgb form of var(--color-orange) (#e2613b) so the canvas
// renderer can compose rgba() strings without reading computed styles.
const ORANGE_R = 226;
const ORANGE_G = 97;
const ORANGE_B = 59;

type ThemeProfile = {
  rest: number;
  active: number;
  haloPeak: number;
};

const DARK_PROFILE: ThemeProfile = {
  rest: 0.22,
  active: 0.7,
  haloPeak: 0.55,
};

const LIGHT_PROFILE: ThemeProfile = {
  rest: 0.46,
  active: 0.95,
  haloPeak: 0.6,
};

type DotState = { ox: number; oy: number; opacity: number; scale: number };

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function MagneticDots() {
  const [enabled, setEnabled] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [profile, setProfile] = useState<ThemeProfile>(DARK_PROFILE);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -10000,
    y: -10000,
    active: false,
  });
  const haloPosRef = useRef<{ x: number; y: number }>({ x: -10000, y: -10000 });
  const haloAlphaRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const profileRef = useRef<ThemeProfile>(DARK_PROFILE);
  profileRef.current = profile;

  // Gate motion on viewport width + reduced-motion. Touch devices skip
  // entirely (no cursor to react to anyway).
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

  // Track viewport size for canvas sizing.
  useEffect(() => {
    function measure() {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Live theme observation — same MutationObserver pattern as before so
  // the field reacts to ThemeToggle without a remount.
  useEffect(() => {
    function readTheme() {
      const isDark = document.documentElement.classList.contains("dark");
      setProfile(isDark ? DARK_PROFILE : LIGHT_PROFILE);
    }
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled || size.w === 0 || size.h === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Backing-store sizing for HiDPI. Set the canvas internal buffer to
    // viewport × dpr and the CSS size to viewport, then scale the draw
    // context so dot/halo coordinates remain in CSS pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Build the dot grid once per resize. cx/cy are the rest positions
    // (the dot's home) — animation displaces from there.
    const cols = Math.max(2, Math.floor(size.w / CELL_PX));
    const rows = Math.max(2, Math.floor(size.h / CELL_PX));
    const stepX = size.w / cols;
    const stepY = size.h / rows;
    const dotCount = Math.min((cols + 1) * (rows + 1), DOT_CAP);
    const cxArr = new Float32Array(dotCount);
    const cyArr = new Float32Array(dotCount);
    {
      let i = 0;
      for (let r = 0; r <= rows && i < dotCount; r++) {
        for (let c = 0; c <= cols && i < dotCount; c++) {
          cxArr[i] = stepX * c;
          cyArr[i] = stepY * r;
          i++;
        }
      }
    }
    // Float32Arrays for per-dot state — fixed-size, no GC pressure each
    // frame. Initial state is "at rest with current profile alpha".
    const oxArr = new Float32Array(dotCount);
    const oyArr = new Float32Array(dotCount);
    const opArr = new Float32Array(dotCount);
    const scArr = new Float32Array(dotCount);
    for (let i = 0; i < dotCount; i++) {
      opArr[i] = profileRef.current.rest;
      scArr[i] = 1;
    }

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    }
    function onMouseLeave() {
      mouseRef.current = { x: -10000, y: -10000, active: false };
    }

    function tick() {
      const { x: mx, y: my, active } = mouseRef.current;
      const p = profileRef.current;

      // Halo position lerps toward cursor; alpha lerps toward haloPeak
      // (when active) or 0 (when off-screen). Smooth halo entry/exit
      // replaces the 0.5s CSS opacity transition the DOM version had.
      haloPosRef.current.x += (mx - haloPosRef.current.x) * LERP_FACTOR;
      haloPosRef.current.y += (my - haloPosRef.current.y) * LERP_FACTOR;
      const targetHaloAlpha = active ? p.haloPeak : 0;
      haloAlphaRef.current += (targetHaloAlpha - haloAlphaRef.current) * 0.08;

      // ctx is non-null here — we early-return above if it's null, and
      // the closure captures it. TypeScript narrows correctly.
      ctx!.clearRect(0, 0, size.w, size.h);

      // Pass 1: batch all rest-state dots in a single fill. Inert dots
      // (outside cursor influence and already settled) skip the lerp and
      // get drawn here at exactly the profile rest opacity.
      ctx!.fillStyle = `rgba(${ORANGE_R}, ${ORANGE_G}, ${ORANGE_B}, ${p.rest})`;
      ctx!.beginPath();
      for (let i = 0; i < dotCount; i++) {
        const cx = cxArr[i];
        const cy = cyArr[i];
        let dist = Infinity;
        if (active) {
          const dx = mx - cx;
          const dy = my - cy;
          dist = Math.hypot(dx, dy);
        }
        // Cull fast-path: outside cursor influence AND state is already
        // at rest -> draw at the rest path and skip the active-dot pass.
        const settled =
          Math.abs(oxArr[i]) < REST_EPSILON &&
          Math.abs(oyArr[i]) < REST_EPSILON &&
          Math.abs(opArr[i] - p.rest) < REST_EPSILON &&
          Math.abs(scArr[i] - 1) < REST_EPSILON;
        if (dist > RANGE_CULL_PX && settled) {
          ctx!.moveTo(cx + DOT_R, cy);
          ctx!.arc(cx, cy, DOT_R, 0, Math.PI * 2);
        }
      }
      ctx!.fill();

      // Pass 2: per-dot lerp + draw for everything inside the cull radius
      // or still settling. Each dot gets its own fill because alpha and
      // scale vary continuously across the cursor's falloff zone.
      for (let i = 0; i < dotCount; i++) {
        const cx = cxArr[i];
        const cy = cyArr[i];
        let dist = Infinity;
        if (active) {
          const dx = mx - cx;
          const dy = my - cy;
          dist = Math.hypot(dx, dy);
        }
        const settled =
          Math.abs(oxArr[i]) < REST_EPSILON &&
          Math.abs(oyArr[i]) < REST_EPSILON &&
          Math.abs(opArr[i] - p.rest) < REST_EPSILON &&
          Math.abs(scArr[i] - 1) < REST_EPSILON;
        if (dist > RANGE_CULL_PX && settled) continue;

        let targetOx = 0;
        let targetOy = 0;
        let targetOp = p.rest;
        let targetScale = 1;
        if (active && dist <= RANGE_PX) {
          const t = 1 - dist / RANGE_PX;
          const factor = smoothstep(t);
          const dx = mx - cx;
          const dy = my - cy;
          const len = dist || 1;
          targetOx = -(dx / len) * MAX_PUSH_PX * factor;
          targetOy = -(dy / len) * MAX_PUSH_PX * factor;
          targetOp = p.rest + (p.active - p.rest) * factor;
          targetScale = 1 + (MAX_GROW - 1) * factor;
        }

        oxArr[i] += (targetOx - oxArr[i]) * LERP_FACTOR;
        oyArr[i] += (targetOy - oyArr[i]) * LERP_FACTOR;
        opArr[i] += (targetOp - opArr[i]) * LERP_FACTOR;
        scArr[i] += (targetScale - scArr[i]) * LERP_FACTOR;

        const x = cx + oxArr[i];
        const y = cy + oyArr[i];
        const r = DOT_R * scArr[i];
        ctx!.fillStyle = `rgba(${ORANGE_R}, ${ORANGE_G}, ${ORANGE_B}, ${opArr[i]})`;
        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Halo: one radial-gradient fill on top of the dots. Cheap because
      // it's a single draw op over a 280×280px region. No mix-blend-mode
      // (banned per the ambient-stack perf budget); orange alpha carries
      // the warmth directly.
      if (haloAlphaRef.current > 0.01) {
        const hx = haloPosRef.current.x;
        const hy = haloPosRef.current.y;
        const grad = ctx!.createRadialGradient(hx, hy, 0, hx, hy, HALO_SIZE_PX / 2);
        grad.addColorStop(0, `rgba(${ORANGE_R}, ${ORANGE_G}, ${ORANGE_B}, ${0.45 * haloAlphaRef.current})`);
        grad.addColorStop(0.55, `rgba(${ORANGE_R}, ${ORANGE_G}, ${ORANGE_B}, 0)`);
        grad.addColorStop(1, `rgba(${ORANGE_R}, ${ORANGE_G}, ${ORANGE_B}, 0)`);
        ctx!.fillStyle = grad;
        ctx!.fillRect(
          hx - HALO_SIZE_PX / 2,
          hy - HALO_SIZE_PX / 2,
          HALO_SIZE_PX,
          HALO_SIZE_PX,
        );
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
    };
  }, [enabled, size.w, size.h]);

  if (!enabled || size.w === 0 || size.h === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
