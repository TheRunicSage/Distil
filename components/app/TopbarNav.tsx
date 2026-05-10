"use client";

// (app) topbar nav. Uses usePathname() to highlight the route the user
// is on — History link picks up an orange-tinted active state, Settings
// icon picks up an active outline + colour. Wordmark is intentionally
// excluded (it's the home affordance, not a destination tab in the same
// sense). The primary CTA also doesn't switch to "active" — it's an
// action, and the page it leads to is short-lived (new-application
// or upload), so an active style would just be noise.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusIcon, SettingsIcon, UploadIcon } from "lucide-react";
import { ThemeToggle } from "@/components/app/ThemeToggle";

type Props = {
  hasCv: boolean;
};

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export function TopbarNav({ hasCv }: Props) {
  const pathname = usePathname() ?? "";

  // Settings icon active state covers /settings and /admin (admin lives
  // under Settings → Admin tools per the IA pass).
  const settingsActive =
    isActive(pathname, "/settings") || isActive(pathname, "/admin");
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
      <ThemeToggle />
      <Link
        href="/settings"
        aria-label="Settings"
        aria-current={settingsActive ? "page" : undefined}
        title="Settings"
        className={
          settingsActive
            ? "inline-flex size-10 items-center justify-center rounded-md bg-[var(--color-orange-subtle)] text-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange/40"
            : "btn-icon"
        }
      >
        <SettingsIcon size={18} aria-hidden />
      </Link>
    </>
  );
}
