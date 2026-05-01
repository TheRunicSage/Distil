"use client";

// Shared motion infrastructure for the landing page.
//
// Owns one mousemove listener, one requestAnimationFrame loop, and one
// matchMedia subscription for prefers-reduced-motion + viewport width.
// Children opt in via subscribe(fn) and read motionEnabled / cursorEnabled
// from context. Per-pattern visibility gating (IntersectionObserver) is
// the subscriber's responsibility — MotionRoot stays generic.
//
// motionEnabled is the page-wide gate: viewport >= 1024px AND user has
// not requested reduced motion. When false, every motion primitive
// degrades to a static fallback at the component level.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type MotionState = {
  mouseX: number;
  mouseY: number;
  t: number;
};

type Subscriber = (state: MotionState) => void;

type MotionContextValue = {
  motionEnabled: boolean;
  cursorEnabled: boolean;
  subscribe: (fn: Subscriber) => () => void;
};

const noopUnsubscribe = () => {};

const MotionContext = createContext<MotionContextValue>({
  motionEnabled: false,
  cursorEnabled: false,
  subscribe: () => noopUnsubscribe,
});

export function useMotion(): MotionContextValue {
  return useContext(MotionContext);
}

export function MotionRoot({ children }: { children: React.ReactNode }) {
  // Defaults assume motion is OFF until we hydrate on the client. SSR
  // therefore renders the static fallback shape, which is the right
  // first paint for slow networks and reduced-motion users alike.
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [cursorEnabled, setCursorEnabled] = useState(false);

  const subscribersRef = useRef<Set<Subscriber>>(new Set());
  const mouseRef = useRef<MotionState>({ mouseX: 0, mouseY: 0, t: 0 });
  const rafRef = useRef<number | null>(null);

  // Re-evaluate motion gates whenever the matchMedia state changes.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const noHover = window.matchMedia("(hover: none)");

    function recompute() {
      const ok = wide.matches && !reduced.matches;
      setMotionEnabled(ok);
      setCursorEnabled(ok && !noHover.matches);
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

  // Single mousemove listener writes coords into the ref. The RAF loop
  // reads them once per frame so subscribers never run more often than
  // the display refresh, no matter how dense mousemove events get.
  useEffect(() => {
    if (!motionEnabled) {
      // Tear down any in-flight RAF when motion is disabled at runtime
      // (e.g. user resized below 1024px or flipped reduced-motion).
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const subscribers = subscribersRef.current;

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        t: mouseRef.current.t,
      };
    }

    function tick(timestamp: number) {
      mouseRef.current = { ...mouseRef.current, t: timestamp };
      const snapshot = mouseRef.current;
      // Snapshot subscribers into an array so a subscriber that unmounts
      // mid-frame (and removes itself from the set) doesn't break iteration.
      const fns = Array.from(subscribers);
      for (const fn of fns) fn(snapshot);
      rafRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [motionEnabled]);

  const subscribe = useCallback<(fn: Subscriber) => () => void>(
    (fn) => {
      // When motion is off, subscribe is a no-op. Subscribers handle
      // their static fallback at render time, so they don't need to
      // re-subscribe when motion flips back on — they'll re-render
      // when motionEnabled changes and call subscribe again themselves.
      if (!motionEnabled) return noopUnsubscribe;
      subscribersRef.current.add(fn);
      return () => {
        subscribersRef.current.delete(fn);
      };
    },
    [motionEnabled],
  );

  const value = useMemo<MotionContextValue>(
    () => ({ motionEnabled, cursorEnabled, subscribe }),
    [motionEnabled, cursorEnabled, subscribe],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
