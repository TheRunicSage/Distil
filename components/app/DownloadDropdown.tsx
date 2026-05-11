// Compact download menu for ChainCard rows whose chain has a success
// leaf. A single icon-only trigger opens a small popover with the
// two download options (CV + cover letter). Designed to live inside
// the parent <Link>-wrapped card without hijacking its click — every
// interaction stops propagation, and the popover closes on outside
// click, Escape, scroll, viewport resize, or item activation.
//
// The popover is rendered through a React portal to document.body
// so it escapes the parent ChainCard's backdrop-blur stacking
// context. Without the portal, z-20 inside the card only outranks
// elements within that card — the next ChainCard sibling renders
// over the popover regardless. With the portal the popover sits at
// the top of the body's stacking order.
//
// Position is computed from the trigger button's bounding client
// rect on every open / scroll / resize so the popover tracks the
// trigger reliably even mid-scroll.
//
// The downloads themselves are plain anchor tags hitting the
// existing /api/applications/[id]/download/[kind] route, which
// 302-redirects to a Supabase signed URL with the right
// Content-Disposition filename. No new backend.

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, FileTextIcon, MailIcon } from "lucide-react";

const MENU_WIDTH = 208; // w-52
const MENU_OFFSET = 6; // px below the trigger
const VIEWPORT_MARGIN = 12; // keep menu off the viewport edge

type Position = { top: number; left: number } | null;

export function DownloadDropdown({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Position>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // createPortal needs document — defer rendering until mount so
  // SSR doesn't choke. The trigger button still renders on the
  // server in the closed state.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Recompute the popover position from the trigger's client rect.
  // Right-aligned to the trigger, clamped to the viewport so we
  // don't bleed off the right edge on narrow screens. Re-runs on
  // every relevant event to keep the popover glued to the trigger.
  useLayoutEffect(() => {
    if (!open) return;

    function update() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const top = rect.bottom + MENU_OFFSET;
      let left = rect.right - MENU_WIDTH;
      // Don't run off the right edge — VIEWPORT_MARGIN gives a
      // little breathing room from the scrollbar.
      const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN;
      if (left > maxLeft) left = maxLeft;
      // Don't run off the left edge either (very narrow screens).
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
      setPos({ top, left });
    }

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Close on outside click, Escape, or scroll outside the menu
  // itself. Scrolling closes (rather than just repositioning)
  // because keeping a popover anchored to a row that's scrolling
  // out of view feels jittery and the menu is one click to reopen.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      // Wrapper still stops propagation so the parent <Link> doesn't
      // navigate when the user is interacting with the menu trigger.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Download files"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-[transform,box-shadow,background-color,border-color,color] duration-150 motion-safe:active:scale-[0.92] ${
          open
            ? "border-orange/60 bg-[var(--color-orange-subtle)] text-orange shadow-[0_2px_8px_rgba(226,97,59,0.18)]"
            : "border-border bg-dark2/40 text-muted-foreground hover:border-orange/40 hover:bg-dark3 hover:text-orange hover:shadow-[0_2px_8px_rgba(226,97,59,0.10)]"
        }`}
      >
        <DownloadIcon className="h-4 w-4" />
      </button>

      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // Fixed positioning + portal to body sidesteps every
            // parent stacking context. z-50 sits above the (app)
            // shell's sticky topbar (z-30) and any other floating
            // chrome.
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: MENU_WIDTH,
            }}
            className="z-50 overflow-hidden rounded-xl border border-border bg-dark4 shadow-lg backdrop-blur-md"
            onClick={(e) => {
              // Items inside the menu still need to navigate, so
              // we stop propagation only at the wrapper boundary,
              // not on the items themselves.
              e.stopPropagation();
            }}
          >
            <DownloadItem
              href={`/api/applications/${applicationId}/download/cv`}
              label="Download CV"
              sub="DOCX"
              icon={<FileTextIcon className="h-4 w-4" />}
              onPick={() => setOpen(false)}
            />
            <div className="h-px bg-border/60" />
            <DownloadItem
              href={`/api/applications/${applicationId}/download/cover_letter`}
              label="Download cover letter"
              sub="DOCX"
              icon={<MailIcon className="h-4 w-4" />}
              onPick={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function DownloadItem({
  href,
  label,
  sub,
  icon,
  onPick,
}: {
  href: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  onPick: () => void;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      // download attribute is a hint; the route's Content-Disposition
      // is the source of truth on the filename. Either way the
      // browser triggers a save dialog rather than navigating.
      download
      onClick={onPick}
      className="flex items-center gap-3 px-3 py-2.5 text-sm text-text transition-[transform,background-color,color] hover:bg-dark3 hover:text-orange motion-safe:active:scale-[0.98]"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {sub}
      </span>
    </a>
  );
}
