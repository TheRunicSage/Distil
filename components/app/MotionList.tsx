"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";

// Stagger container — children animate in sequence with a 60ms gap.
export function MotionList({ children }: { children: ReactNode }) {
  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
      }}
    >
      {children}
    </m.div>
  );
}

// Single item that fades up. Use inside MotionList.
export function MotionListItem({ children }: { children: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </m.div>
  );
}

// Standalone section that fades up on mount. `delay` is in ms (matches
// FadeUp's signature so the swap is mechanical) and converted to
// seconds internally.
export function MotionSection({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <m.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.54, ease: [0.2, 0.8, 0.2, 1], delay: delay / 1000 }}
      className={className}
    >
      {children}
    </m.section>
  );
}
