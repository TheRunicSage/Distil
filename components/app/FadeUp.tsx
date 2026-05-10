"use client";

// IntersectionObserver-driven scroll reveal. Children mount in their
// hidden state (.fade-up); once the element enters the viewport we
// flip data-revealed="true" and CSS handles the animation.
//
// Use as a wrapper around a section. Stagger child animations by
// adding `data-fade-stagger` on the wrapper and `.fade-up` on each
// child — the CSS adds 80ms steps automatically up to 6 children.

import { useEffect, useRef, type ReactNode, type ElementType } from "react";

type Props = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Delay reveal by N ms after the section enters the viewport. */
  delayMs?: number;
  /** Stagger immediate children. Adds data-fade-stagger to the wrapper. */
  stagger?: boolean;
  /** Margin around the viewport before triggering. Default "0px 0px -10% 0px". */
  rootMargin?: string;
};

export function FadeUp({
  children,
  as: Tag = "div",
  className,
  delayMs = 0,
  stagger,
  rootMargin = "0px 0px -10% 0px",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Old browser or SSR — reveal immediately.
      el.dataset.revealed = "true";
      return;
    }
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.dataset.revealed = "true";
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            if (delayMs > 0) {
              window.setTimeout(() => {
                target.dataset.revealed = "true";
              }, delayMs);
            } else {
              target.dataset.revealed = "true";
            }
            obs.unobserve(target);
          }
        }
      },
      { rootMargin, threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delayMs, rootMargin]);

  const merged = ["fade-up", className].filter(Boolean).join(" ");
  const Element = Tag as ElementType;
  return (
    <Element
      ref={ref as React.RefObject<HTMLElement>}
      className={merged}
      {...(stagger ? { "data-fade-stagger": true } : {})}
    >
      {children}
    </Element>
  );
}
