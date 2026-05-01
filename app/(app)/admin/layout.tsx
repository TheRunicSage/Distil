// Admin shell. Gates every /admin/* page on profiles.is_admin = true.
// Unauthenticated → /login. Authenticated but not admin → /dashboard
// (no enumeration; same response either way for a deeply-suspect user).
//
// Layout is intentionally minimal — three nav links and a content
// area. Build sequence step 13 ships before the user-facing screens
// so internal triage works from day one.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/errors/api-error";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/logs", label: "Errors" },
  { href: "/admin/telemetry", label: "Telemetry" },
  { href: "/admin/users", label: "Users" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof ApiError && err.code === "not_authenticated") {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            Admin
          </span>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-dark4 hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link
          href="/settings"
          className="text-xs text-muted-foreground hover:text-text"
        >
          ← Back to Settings
        </Link>
      </div>
      {children}
    </div>
  );
}
