"use client";

// Compact download menu for ChainCard rows whose chain has a success
// leaf. A single icon-only trigger opens a small popover with the
// two download options (CV + cover letter). Designed to live inside
// the parent <Link>-wrapped card without hijacking its click — every
// interaction stops propagation, and the popover closes on outside
// click, Escape, or item activation.
//
// The downloads themselves are plain anchor tags hitting the
// existing /api/applications/[id]/download/[kind] route, which
// 302-redirects to a Supabase signed URL with the right
// Content-Disposition filename. No new backend.
//
// Pattern matches the existing "icon-only secondary affordance"
// language used by ThemeToggle and the Settings gear in the topbar.

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, FileTextIcon, MailIcon } from "lucide-react";

export function DownloadDropdown({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
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
      ref={wrapperRef}
      className="relative shrink-0"
      onClick={(e) => {
        // Stops the parent <Link> from navigating when the user is
        // interacting with the menu.
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-label="Download files"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-orange/60 bg-[var(--color-orange-subtle)] text-orange"
            : "border-border bg-dark2/40 text-muted-foreground hover:border-orange/40 hover:text-orange"
        }`}
      >
        <DownloadIcon className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-border bg-dark4 shadow-lg backdrop-blur-md"
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
        </div>
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
      className="flex items-center gap-3 px-3 py-2.5 text-sm text-text transition-colors hover:bg-dark3 hover:text-orange"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {sub}
      </span>
    </a>
  );
}
