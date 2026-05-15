"use client";

import { m, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { pageTransition } from "./animation-variants";

// Short cross-fade between route changes. `mode="wait"` ensures the
// outgoing tree finishes its exit before the new one mounts —
// otherwise both would render simultaneously for a beat and reflow
// the layout. Pathname keys the m.div so React/AnimatePresence treats
// each route as a fresh node.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <m.div
        key={pathname}
        variants={pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
