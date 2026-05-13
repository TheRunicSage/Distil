"use client";

// Profile dropdown in the (app) topbar. Trigger is a 40px circle with
// the user's first email initial (DP-1 A); panel anchors below-right
// with a .panel shell + .surface-row menu items (DP-9 B). Dismisses on
// Esc, outside-click, and route change (DP-7 A).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  HelpCircleIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { isAdmin as isAdminRole, type Role } from "@/lib/auth/roles";
import { signOut } from "@/app/(auth)/login/actions";

type Props = {
  email: string;
  role: Role;
};

function initialOf(email: string): string {
  const first = email.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

export function UserMenu({ email, role }: Props) {
  const showAdminTools = isAdminRole(role);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change so navigation via menu items collapses the
  // panel before the destination paints.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-dark2 text-base font-semibold text-orange transition-colors hover:border-orange/40 hover:bg-dark3 hover:shadow-[0_2px_8px_rgba(226,97,59,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange/40 motion-safe:active:scale-[0.97]"
      >
        {initialOf(email)}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="panel menu-fade-in absolute right-0 top-[calc(100%+8px)] z-40 w-64 max-w-[calc(100vw-1rem)] space-y-1 p-2"
        >
          <div
            className="truncate px-3 py-2 text-sm text-muted-foreground"
            title={email}
          >
            {email}
          </div>
          <div className="my-1 h-px bg-border/60" />
          <ThemeToggle variant="menu" />
          <Link
            href="/settings"
            role="menuitem"
            className="surface-row w-full gap-3"
          >
            <SettingsIcon size={18} aria-hidden />
            <span className="flex-1">Settings</span>
          </Link>
          <Link
            href="/faq"
            role="menuitem"
            className="surface-row w-full gap-3"
          >
            <HelpCircleIcon size={18} aria-hidden />
            <span className="flex-1">FAQ</span>
          </Link>
          {showAdminTools && (
            <Link
              href="/admin/usage"
              role="menuitem"
              className="surface-row w-full gap-3"
            >
              <ShieldIcon size={18} aria-hidden />
              <span className="flex-1">Admin</span>
            </Link>
          )}
          <div className="my-1 h-px bg-border/60" />
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="surface-row w-full gap-3 text-left text-orange hover:bg-[var(--color-orange-subtle)] hover:text-orange-light"
            >
              <LogOutIcon size={18} aria-hidden />
              <span className="flex-1">Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
