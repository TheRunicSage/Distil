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

// Density bumps:
//   2026-05-09: CELL_PX 80 → 56 (~2× density), DOT_CAP 400 → 800.
//   2026-05-09 (later): CELL_PX 56 → 44 (~1.6× more), DOT_CAP 800 → 1300.
// Held per-frame cost flat across both bumps by skipping inert dots —
// see the cull fast-path inside the tick loop. The cull bounds active
// iterations to dots within RANGE_CULL_PX of the cursor + dots still
// settling, regardless of total dot count.
const CELL_PX = 44;
const DOT_R = 1.7;
const RANGE_PX = 200; // softly wide; smoothstep keeps the outer ring gentle
const RANGE_CULL_PX = RANGE_PX + 60; // beyond this + already-at-rest, skip
const REST_EPSILON = 0.05; // |state - rest| within this counts as settled
const MAX_PUSH_PX = 8; // very subtle displacement — felt, not seen
const MAX_GROW = 1.18; // tiny lift on the dots near the cursor
const LERP_FACTOR = 0.11; // slow, graceful return; never springy
const HALO_SIZE_PX = 280; // wider so the centre isn't bright; reads as a haze
const DOT_CAP = 1300;

// Theme-conditioned opacities. Dark canvas needs lower numbers since
// orange-on-dark already pops; the cream light canvas needs higher
// numbers since orange-on-cream washes out at low alpha. Halo also
// needs different blend modes per theme — `screen` warms a dark
// surface, `multiply` tints a light one without bleaching it.
type ThemeProfile = {
  rest: number;
  active: number;
  haloPeak: number;
  haloBlend: "screen" | "multiply";
};

const DARK_PROFILE: ThemeProfile = {
  rest: 0.22,
  active: 0.42,
  haloPeak: 0.3,
  haloBlend: "screen",
};

// Light-mode visibility lift (2026-05-09): orange-on-cream at 0.32
// rest alpha was washing out — page read as "mostly white". Bumped
// rest / active / haloPeak so the dot field actually carries presence
// against the off-white canvas. Same brand orange, just more visible.
const LIGHT_PROFILE: ThemeProfile = {
  rest: 0.46,
  active: 0.72,
  haloPeak: 0.34,
  haloBlend: "multiply",
};

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
  const [profile, setProfile] = useState<ThemeProfile>(DARK_PROFILE);
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
  // Live profile ref so the RAF tick reads the current theme without
  // restarting the loop on every theme toggle.
  const profileRef = useRef<ThemeProfile>(DARK_PROFILE);
  profileRef.current = profile;

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

  // Track the theme. The `dark` class is toggled on documentElement by
  // the ThemeToggle component and the inline pre-paint script in
  // app/layout.tsx; observing it lets the dots respond live without
  // a hard reload.
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
      const p = profileRef.current;

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
        haloRef.current.style.opacity = active ? String(p.haloPeak) : "0";
      }

      for (let i = 0; i < refs.length; i++) {
        const el = refs[i];
        const dot = dots[i];
        if (!el || !dot) continue;

        // Cheap distance check first so the cull fast-path can short-circuit
        // before we allocate a state object or compute a smoothstep factor.
        let dist = Infinity;
        if (active) {
          const dx = mx - dot.cx;
          const dy = my - dot.cy;
          dist = Math.hypot(dx, dy);
        }

        // Cull fast-path: dots well outside cursor influence whose state is
        // already at rest skip the lerp + DOM write entirely. Density was
        // doubled in 2026-05-09 by halving CELL_PX; this branch keeps the
        // per-frame cost flat because most dots in any given frame are at
        // rest and outside RANGE_CULL_PX. Approaching cursor reactivates
        // them automatically once dist falls below the cull threshold.
        const existing = states[i];
        if (
          dist > RANGE_CULL_PX &&
          existing &&
          Math.abs(existing.ox) < REST_EPSILON &&
          Math.abs(existing.oy) < REST_EPSILON &&
          Math.abs(existing.opacity - p.rest) < REST_EPSILON &&
          Math.abs(existing.scale - 1) < REST_EPSILON
        ) {
          continue;
        }

        let targetOx = 0;
        let targetOy = 0;
        let targetOp = p.rest;
        let targetScale = 1;

        if (active && dist <= RANGE_PX) {
          const t = 1 - dist / RANGE_PX;
          const factor = smoothstep(t);
          const dx = mx - dot.cx;
          const dy = my - dot.cy;
          const len = dist || 1;
          targetOx = -(dx / len) * MAX_PUSH_PX * factor;
          targetOy = -(dy / len) * MAX_PUSH_PX * factor;
          targetOp = p.rest + (p.active - p.rest) * factor;
          targetScale = 1 + (MAX_GROW - 1) * factor;
        }

        let s = existing;
        if (!s) {
          s = { ox: 0, oy: 0, opacity: p.rest, scale: 1 };
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
      const restOp = profileRef.current.rest;
      for (const el of dotRefs.current) {
        if (el) {
          el.style.transform = "";
          el.style.opacity = String(restOp);
        }
      }
      dotStateRef.current = [];
      if (haloRef.current) haloRef.current.style.opacity = "0";
    };
  }, [enabled, dots]);

  if (size.w === 0 || size.h === 0) return null;

  return (
    <>
      {/* Soft cursor halo — a barely-there warm haze, not a glowing orb.
          Wide radius (280px) plus an early falloff stop at 45% means the
          centre is the brightest point but never bright; the shoulders
          fall off into nothing well before the edge. Theme-conditioned
          blend mode warms a dark canvas (`screen`) and tints a light
          canvas (`multiply`) without bleaching either. */}
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
            "radial-gradient(circle, var(--color-orange-glow) 0%, transparent 55%)",
          opacity: 0,
          transition: "opacity 0.5s ease-out",
          mixBlendMode: profile.haloBlend,
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
            opacity={profile.rest}
            style={{ transformOrigin: `${dot.cx}px ${dot.cy}px` }}
          />
        ))}
      </svg>
    </>
  );
}
