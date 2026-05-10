"use client";

// Admin sub-nav. Reads the current path with usePathname() so the
// active tab gets a visible orange-tinted state — matches the
// status-filter pill pattern used inside individual admin pages so the
// whole admin shell speaks the same visual language.

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/logs", label: "Errors" },
  { href: "/admin/telemetry", label: "Telemetry" },
  { href: "/admin/users", label: "Users" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Match nested admin routes (e.g. /admin/users/123) but not unrelated
  // routes that happen to share a prefix (no nested admin routes today,
  // but the helper is robust for the future).
  return pathname.startsWith(href + "/");
}

export function AdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md border border-orange/60 bg-[var(--color-orange-subtle)] px-3.5 py-1.5 text-sm font-semibold text-orange shadow-[0_0_0_1px_var(--color-orange-subtle)]"
                : "rounded-md border border-transparent px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-dark4 hover:text-text"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
