"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// 35 small orange particles drifting in subtle sin/cos paths. Lazy:
// only paints on desktop (>=1024px) and respects prefers-reduced-motion.
// Uses translate3d so paint happens on the compositor, not main thread.
const PARTICLE_COUNT = 35;
const DRIFT_SPEED = 0.15;

type P = { x: number; y: number; size: number; speed: number; phase: number };

export function AmbientParticles() {
  const [enabled, setEnabled] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const recompute = () => setEnabled(wide.matches && !reduced.matches);
    recompute();
    wide.addEventListener("change", recompute);
    reduced.addEventListener("change", recompute);
    return () => {
      wide.removeEventListener("change", recompute);
      reduced.removeEventListener("change", recompute);
    };
  }, []);

  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const particles = useMemo<P[]>(() => {
    if (size.w === 0) return [];
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: Math.random() * size.w,
      y: Math.random() * size.h,
      size: 1.5 + Math.random() * 3,
      speed: 0.08 + Math.random() * 0.15,
      phase: i * 1.2,
    }));
  }, [size.w, size.h]);

  useEffect(() => {
    if (!enabled || particles.length === 0) return;
    const dots = document.querySelectorAll<HTMLDivElement>("[data-particle]");
    let running = true;

    function tick(t: number) {
      if (!running) return;
      timeRef.current = t * 0.001;
      dots.forEach((dot, i) => {
        const p = particles[i];
        if (!p) return;
        const driftX = Math.sin(timeRef.current * p.speed + p.phase) * DRIFT_SPEED;
        const driftY = Math.cos(timeRef.current * p.speed * 0.7 + p.phase) * DRIFT_SPEED;
        dot.style.transform = `translate3d(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px, 0)`;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, particles]);

  if (!enabled || size.w === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[1]" aria-hidden>
      {particles.map((p, i) => (
        <div
          key={i}
          data-particle
          className="absolute rounded-full bg-orange/20"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            opacity: 0.15 + p.speed * 0.35,
          }}
        />
      ))}
    </div>
  );
}
