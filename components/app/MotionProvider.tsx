"use client";

import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// Wraps the (app) tree once at the root so every consumer can use the
// short `m.div` etc. import without paying for full motion bundles.
// `strict` errors at runtime if someone reaches for `motion.div` —
// LazyMotion only ships the dom-animation feature set.
// `reducedMotion="user"` honours the OS-level preference globally; no
// per-component matchMedia gate needed.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
