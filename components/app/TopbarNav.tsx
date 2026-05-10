"use client";

// (app) topbar nav — left/middle cluster.
//
// Renders:
//   - "+ New application" / "Upload CV" — primary orange CTA. Always
//     leftmost so the eye lands on it; user directive 2026-05-10 to
//     keep this orange by default to lead users into a new generation.
//   - History link — secondary nav (text-only btn-ghost).
//
// Theme toggle, Settings, FAQ, Sign out moved into the UserMenu
// avatar dropdown (right of this component) per the UI refresh
// phase 5 (2026-05-10). Wordmark is in the parent layout — it's the
// home affordance, not a destination tab in the same sense.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusIcon, UploadIcon } from "lucide-react";

type Props = {
  hasCv: boolean;
};

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export function TopbarNav({ hasCv }: Props) {
  const pathname = usePathname() ?? "";

  const historyActive =
    isActive(pathname, "/history") || isActive(pathname, "/application");

  return (
    <>
      {hasCv ? (
        <Link
          href="/application/new"
          className="btn-primary"
          aria-label="New application"
        >
          <PlusIcon size={18} aria-hidden />
          <span className="hidden sm:inline">New application</span>
        </Link>
      ) : (
        <Link href="/upload" className="btn-primary" aria-label="Upload CV">
          <UploadIcon size={18} aria-hidden />
          <span className="hidden sm:inline">Upload CV</span>
        </Link>
      )}
      <Link
        href="/history"
        aria-current={historyActive ? "page" : undefined}
        className={
          historyActive
            ? "inline-flex items-center gap-2 rounded-md bg-[var(--color-orange-subtle)] px-4 py-2 text-base font-semibold text-orange transition-colors"
            : "btn-ghost"
        }
      >
        History
      </Link>
    </>
  );
}
