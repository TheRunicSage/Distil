"use client";

// Reveal-on-mount + reveal-on-intersect primitive. Two modes:
//
//   mode="mount" — applies the visible state on mount (with optional
//   delay). Use on (app) pages for a one-time "coming to life" stagger
//   after a page load. Pages there are typically 1-2 viewports tall;
//   intersection-based reveal would never fire for above-fold content
//   so mount mode is the right fit.
//
//   mode="scroll" — uses IntersectionObserver to apply the visible
//   state when the element scrolls into view (one-time, then
//   unobserve). Use on the landing page where there's real below-fold
//   distance to reveal as the reader works down the page.
//
// Visual class lives in app/globals.css under .fade-up. Reduced-motion
// users get instant visibility there (no opacity, no transform) so the
// page is never blank for anyone who opted out of motion.
//
// Defaults to mode="scroll" since that's the more common landing
// pattern; (app) call sites pass mode="mount" explicitly.

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  mode?: "scroll" | "mount";
  delay?: number; // ms
  as?: ElementType;
  className?: string;
};

export function FadeUp({
  children,
  mode = "scroll",
  delay = 0,
  as,
  className = "",
}: Props) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (mode === "mount") {
      const t = window.setTimeout(() => setVisible(true), delay);
      return () => window.clearTimeout(t);
    }

    // mode === "scroll": IntersectionObserver, one-time reveal.
    // rootMargin pulls the trigger up by 10% of the viewport so the
    // reveal kicks in slightly before the section is fully in view —
    // reads as anticipation rather than reaction.
    if (typeof IntersectionObserver === "undefined") {
      // Fallback for browsers without IntersectionObserver: reveal
      // immediately. Should never happen on supported browsers but
      // guards against a blank render in edge cases.
      const t = window.setTimeout(() => setVisible(true), delay);
      return () => window.clearTimeout(t);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.setTimeout(() => setVisible(true), delay);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, delay]);

  return (
    <Tag
      ref={ref}
      className={`fade-up${className ? " " + className : ""}`}
      data-fade-state={visible ? "visible" : "hidden"}
    >
      {children}
    </Tag>
  );
}
