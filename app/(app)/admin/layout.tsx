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
    <div className="flex flex-1 flex-col">
      <header className="flex h-[50px] shrink-0 items-center justify-between border-b border-border bg-dark2 px-6">
        <div className="flex items-center gap-6">
          <span className="font-serif italic text-lg text-text">Distil</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            Admin
          </span>
        </div>
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
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
