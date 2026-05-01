"use client";

// Typographic Gravity. Eleven Curiosum-lineage words sit at fixed
// positions inside a container; each word has a "mass" derived from
// its font size, and the heavier the word, the harder it gets pulled
// toward the cursor when the cursor is in range. DOM-only (no canvas)
// so the words remain real, accessible, selectable text.
//
// Subscribes to MotionRoot's RAF loop. When motion is disabled the
// words sit at their resting positions — the field still reads as a
// composed sentence, just static.

import { useEffect, useMemo, useRef } from "react";
import { useMotion } from "./MotionRoot";

type Word = {
  text: string;
  x: number; // percent of container width (0-100)
  y: number; // percent of container height (0-100)
  mass: number; // 1 (light) → 3 (heavy)
};

const WORDS: Word[] = [
  { text: "curiosity", x: 14, y: 24, mass: 2.2 },
  { text: "rigour", x: 78, y: 18, mass: 2 },
  { text: "honesty", x: 30, y: 50, mass: 2.6 },
  { text: "fit", x: 56, y: 50, mass: 3 },
  { text: "craft", x: 80, y: 58, mass: 2 },
  { text: "shape", x: 18, y: 78, mass: 1.4 },
  { text: "evidence", x: 46, y: 80, mass: 1.5 },
  { text: "voice", x: 70, y: 80, mass: 1.4 },
  { text: "candour", x: 8, y: 56, mass: 1.3 },
  { text: "story", x: 90, y: 38, mass: 1.3 },
  { text: "match", x: 50, y: 16, mass: 1.5 },
];

const RANGE = 380; // px — pull radius around the cursor
const MAX_OFFSET_PER_MASS = 14; // px per unit of mass at full pull

function fontSizeFor(mass: number): string {
  // Map mass (1..3) to a Fraunces-italic display size. Light masses sit
  // in the body-paragraph range; the heaviest words break into display.
  const px = 18 + (mass - 1) * 18;
  return `${px}px`;
}

export function GravityField({ className }: { className?: string }) {
  const { motionEnabled, subscribe } = useMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const centersRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    function measure() {
      const wordEls = wordRefs.current;
      centersRef.current = wordEls.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  useEffect(() => {
    // Words are centered at their (left%, top%) position via the
    // -50%/-50% baseline transform. RAF writes compose the gravitational
    // offset on top of that so the centering is preserved.
    function reset() {
      for (const el of wordRefs.current) {
        if (el) el.style.transform = "translate(-50%, -50%)";
      }
    }
    if (!motionEnabled) {
      reset();
      return;
    }
    const unsubscribe = subscribe(({ mouseX, mouseY }) => {
      const centers = centersRef.current;
      const wordEls = wordRefs.current;
      for (let i = 0; i < wordEls.length; i++) {
        const el = wordEls[i];
        const c = centers[i];
        if (!el || !c) continue;
        const dx = mouseX - c.x;
        const dy = mouseY - c.y;
        const dist = Math.hypot(dx, dy) || 1;
        const factor = Math.max(0, 1 - dist / RANGE);
        if (factor === 0) {
          el.style.transform = "translate(-50%, -50%)";
          continue;
        }
        const max = WORDS[i].mass * MAX_OFFSET_PER_MASS;
        const pull = max * factor;
        const ox = (dx / dist) * pull;
        const oy = (dy / dist) * pull;
        el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      }
    });
    return unsubscribe;
  }, [motionEnabled, subscribe]);

  // Compute the resting transform once: each word is positioned at (x%,y%)
  // of the container. We use percent positioning so the field scales with
  // the container — no JS layout pass needed on resize.
  const positioned = useMemo(() => WORDS, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative" }}
      aria-label={`Curiosum: ${WORDS.map((w) => w.text).join(", ")}`}
      role="img"
    >
      {positioned.map((word, i) => (
        <span
          key={word.text}
          ref={(el) => {
            wordRefs.current[i] = el;
          }}
          className="gravity-word"
          style={{
            left: `${word.x}%`,
            top: `${word.y}%`,
            fontSize: fontSizeFor(word.mass),
            transform: "translate(-50%, -50%)",
            opacity: 0.85,
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}
