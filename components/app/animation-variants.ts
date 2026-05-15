import type { Variants, Transition } from "framer-motion";

export const easings = {
  smooth: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  snap: [0.4, 0, 0.2, 1] as [number, number, number, number],
  spring: { type: "spring" as const, stiffness: 300, damping: 28 },
};

export const transitions = {
  fast: { duration: 0.15, ease: easings.smooth },
  normal: { duration: 0.3, ease: easings.smooth },
  slow: { duration: 0.54, ease: easings.smooth },
  spring: easings.spring,
} satisfies Record<string, Transition>;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: transitions.normal },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.normal },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: transitions.spring },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: transitions.slow },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: transitions.normal },
};

export const pageTransition: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: easings.smooth } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: easings.smooth } },
};

export const listTransition: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

export const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.01, y: -2, transition: transitions.spring },
  tap: { scale: 0.98, transition: { duration: 0.08 } },
};

export const pillArrive: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.92 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.08, ...transitions.normal },
  }),
};

export const countUpSpring = {
  type: "spring" as const,
  stiffness: 100,
  damping: 20,
  mass: 0.5,
};
