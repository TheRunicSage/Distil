"use client";

// Forty-Eyes ambient grid, responsive density. Eyes are spaced on a
// fixed CELL_PX pixel grid; the count adapts to the container so the
// hero stays visually-consistent across breakpoints rather than
// stretching 40 eyes across an ultrawide screen. Total count is capped
// at MAX_EYES to keep per-frame DOM writes bounded.
//
// All eyes share a single subscribe() to MotionRoot's RAF loop, so the
// per-frame cost is one mouse read + one DOM write per eye.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMotion } from "./MotionRoot";

const CELL_PX = 130;
const MAX_EYES = 96;
const PUPIL_OFFSET_PX = 5;
const EYE_R = 22;
const PUPIL_R = 6;

type EyeSeed = { cx: number; cy: number };

function buildEyes(width: number, height: number): EyeSeed[] {
  if (width <= 0 || height <= 0) return [];
  const rawCols = Math.max(4, Math.floor(width / CELL_PX));
  const rawRows = Math.max(3, Math.floor(height / CELL_PX));
  const cols = Math.max(4, Math.min(14, rawCols));
  const rows = Math.max(3, Math.min(8, rawRows));

  const stepX = width / cols;
  const stepY = height / rows;
  const eyes: EyeSeed[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      eyes.push({
        cx: stepX * (c + 0.5),
        cy: stepY * (r + 0.5),
      });
      if (eyes.length >= MAX_EYES) return eyes;
    }
  }
  return eyes;
}

export function EyesGrid({ className }: { className?: string }) {
  const { motionEnabled, subscribe } = useMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pupilsRef = useRef<(SVGCircleElement | null)[]>([]);
  const centersRef = useRef<{ x: number; y: number }[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Track the container size with ResizeObserver so the grid recomputes
  // on responsive breakpoints, theme changes that shift padding, etc.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    return () => observer.disconnect();
  }, []);

  const eyes = useMemo(() => buildEyes(size.w, size.h), [size.w, size.h]);

  // Reset the pupil refs array whenever the eye count changes; React
  // overwrites slots in place but a shrinking grid would leave stale
  // refs to detached <circle> nodes.
  useEffect(() => {
    pupilsRef.current = pupilsRef.current.slice(0, eyes.length);
  }, [eyes.length]);

  // Cache eye centers in viewport coords (no per-frame layout reads).
  useEffect(() => {
    function measure() {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      centersRef.current = eyes.map((eye) => ({
        x: rect.left + eye.cx,
        y: rect.top + eye.cy,
      }));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [eyes]);

  useEffect(() => {
    if (!motionEnabled) {
      for (const p of pupilsRef.current) {
        if (p) p.style.transform = "";
      }
      return;
    }
    const unsubscribe = subscribe(({ mouseX, mouseY }) => {
      const centers = centersRef.current;
      const pupils = pupilsRef.current;
      for (let i = 0; i < pupils.length; i++) {
        const p = pupils[i];
        const c = centers[i];
        if (!p || !c) continue;
        const dx = mouseX - c.x;
        const dy = mouseY - c.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (dx / len) * PUPIL_OFFSET_PX;
        const oy = (dy / len) * PUPIL_OFFSET_PX;
        p.style.transform = `translate(${ox}px, ${oy}px)`;
      }
    });
    return unsubscribe;
  }, [motionEnabled, subscribe]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={size.w > 0 ? `0 0 ${size.w} ${size.h}` : "0 0 1 1"}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {eyes.map((eye, i) => (
          <g key={i}>
            <circle
              cx={eye.cx}
              cy={eye.cy}
              r={EYE_R}
              fill="none"
              stroke="var(--color-orange)"
              strokeWidth={1.25}
              opacity={0.4}
            />
            <circle
              ref={(el) => {
                pupilsRef.current[i] = el;
              }}
              cx={eye.cx}
              cy={eye.cy}
              r={PUPIL_R}
              fill="var(--color-orange)"
              opacity={0.9}
              className="eyes-pupil"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
