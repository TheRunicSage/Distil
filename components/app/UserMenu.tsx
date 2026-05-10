"use client";

// (app) topbar account dropdown. Replaces the standalone ThemeToggle
// icon + Settings gear icon with a single avatar trigger that opens a
// dropdown carrying:
//   1. Email header (read-only)
//   2. Theme toggle (Sun/Moon, click toggles)
//   3. FAQ link
//   4. Settings link
//   5. Sign out (form action)
//
// Per CLAUDE.md Decision Log [14] (2026-05-10 UI refresh phase 5).
// Settings is reachable ONLY via this dropdown — no other nav surface
// links to /settings (per user directive).
//
// Accessibility (WAI-ARIA Authoring Practices):
//   - Trigger: aria-haspopup="menu", aria-expanded, aria-label
//   - Panel: role="menu"
//   - Items: role="menuitem"
//   - Esc closes and returns focus to trigger
//   - Click outside closes
//   - Theme toggle is a menuitem (not menuitemcheckbox — the action
//     immediately reflects in the icon, so the affordance is clear
//     without an explicit checked state)
//
// Theme switch reuses the View Transitions circular reveal that
// ThemeToggle had; click coordinates are written to --x/--y CSS vars
// before the swap so the new theme paints out from the click point.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CircleHelpIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

type Theme = "light" | "dark";

function readSavedTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("theme", next);
  } catch {
    // storage may be disabled — toggle still works for the current session.
  }
}

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Email-first-letter avatar. Falls back to "?" for empty / unparseable.
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  useEffect(() => {
    setTheme(readSavedTheme());
  }, []);

  // Click outside the trigger + panel closes the menu.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Esc closes and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggleTheme(e: React.MouseEvent<HTMLButtonElement>) {
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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title="Account"
        className="user-menu-trigger"
      >
        <span aria-hidden>{initial}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Account menu"
          className="user-menu-panel"
        >
          <p
            className="user-menu-email"
            aria-label={`Signed in as ${email}`}
          >
            {email}
          </p>
          <div className="user-menu-divider" aria-hidden />

          <button
            type="button"
            role="menuitem"
            onClick={toggleTheme}
            className="user-menu-item"
          >
            {theme === "dark" ? (
              <SunIcon size={16} aria-hidden />
            ) : (
              <MoonIcon size={16} aria-hidden />
            )}
            <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
          </button>

          <Link
            href="/faq"
            role="menuitem"
            className="user-menu-item"
            onClick={() => setOpen(false)}
          >
            <CircleHelpIcon size={16} aria-hidden />
            <span>FAQ</span>
          </Link>

          <Link
            href="/settings"
            role="menuitem"
            className="user-menu-item"
            onClick={() => setOpen(false)}
          >
            <SettingsIcon size={16} aria-hidden />
            <span>Settings</span>
          </Link>

          <div className="user-menu-divider" aria-hidden />

          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="user-menu-item user-menu-item-danger"
            >
              <LogOutIcon size={16} aria-hidden />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
