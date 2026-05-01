"use client";

// Theme toggle for the (app) topbar. Captures the click position into
// CSS custom properties on documentElement, then runs the swap inside
// a startViewTransition() so the new theme paints in via the CSS
// keyframe defined in globals.css (`theme-reveal`). The clip-path
// animates from circle(0%) at the click point to circle(150%), which
// reads as the new theme "eating" the page outward from the button.
//
// Browsers without View Transitions (older Safari/Firefox) fall
// through to an instant theme swap — same visual end state, no
// animation. That's the right progressive-enhancement behaviour.

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

type Theme = "light" | "dark";

function readSavedTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("theme", next);
  } catch {
    // ignore — user may have storage disabled; toggle still works for
    // the current session.
  }
}

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readSavedTheme());
  }, []);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.style.setProperty("--x", `${e.clientX}px`);
    root.style.setProperty("--y", `${e.clientY}px`);

    const doc = document as ViewTransitionDoc;
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(() => {
        applyTheme(next);
        setTheme(next);
      });
    } else {
      applyTheme(next);
      setTheme(next);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className="btn-icon size-8"
    >
      {theme === "dark" ? (
        <SunIcon size={15} aria-hidden />
      ) : (
        <MoonIcon size={15} aria-hidden />
      )}
    </button>
  );
}
