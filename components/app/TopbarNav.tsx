"use client";

// (app) topbar nav. Uses usePathname() to highlight the route the user
// is on — History link picks up an orange-tinted active state. Wordmark
// is the home affordance, the UserMenu dropdown on the right collapses
// theme toggle + Settings + FAQ + Admin (gated) + Sign out behind one
// 40px circle trigger (see Decision Log [14], 2026-05-11). The primary
// CTA doesn't switch to "active" — it's an action, and the page it
// leads to is short-lived (new-application or upload), so an active
// style would just be noise.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusIcon, UploadIcon } from "lucide-react";
import { UserMenu } from "@/components/app/UserMenu";

type Props = {
  hasCv: boolean;
  email: string;
  isAdmin: boolean;
};

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export function TopbarNav({ hasCv, email, isAdmin }: Props) {
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
      <UserMenu email={email} isAdmin={isAdmin} />
    </>
  );
}
