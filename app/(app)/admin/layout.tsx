// Admin shell. Gates every /admin/* page on profiles.is_admin = true.
// Unauthenticated → /login. Authenticated but not admin → /dashboard
// (no enumeration; same response either way for a deeply-suspect user).
//
// Layout breaks out of the (app) shell's 720px content cap via a
// 50vw viewport-breakout (the same trick used on the success view's
// preview grid). Admin tables and dashboards need real width to
// breathe — capping them at reading width was forcing every column
// past Status into a horizontal scroll.

import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/app/AdminNav";
import { ApiError } from "@/lib/errors/api-error";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

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
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-6">
      <div className="mx-auto max-w-[1280px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
              Admin
            </span>
            <AdminNav />
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
    </div>
  );
}
