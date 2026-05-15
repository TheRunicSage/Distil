"use client";

import { m, useScroll, useSpring } from "framer-motion";

// 2px brand-orange progress bar pinned to the top of the viewport,
// driven by scroll position with a spring smoothing pass so it doesn't
// hitch on long pages.
export function ScrollIndicator() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  return (
    <m.div
      className="pointer-events-none fixed left-0 top-0 z-50 h-[2px] origin-left bg-orange"
      style={{ scaleX }}
    />
  );
}
