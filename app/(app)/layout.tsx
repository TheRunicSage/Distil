// Authenticated app shell. Topbar uses the design-system classes from
// globals.css so spacing/typography stay aligned across (app) pages.
//
// IA (UI refresh phase 5, 2026-05-10):
//   - Distil wordmark — home affordance, links to /dashboard
//   - "+ New application" — always-visible primary CTA (orange).
//     When no master CV: same button routes to /upload with a
//     context-appropriate label.
//   - History link — secondary nav, text-only
//   - UserMenu (avatar dropdown) — collapses Email · Theme toggle ·
//     FAQ · Settings · Sign out behind a single click.
//     Settings is reachable ONLY via this menu (per user directive).

import Link from "next/link";
import { redirect } from "next/navigation";
import { AmbientBackground } from "@/components/app/AmbientBackground";
import { AppShell } from "@/components/app/AppShell";
import { MagneticDots } from "@/components/app/MagneticDots";
import { TopbarNav } from "@/components/app/TopbarNav";
import { UserMenu } from "@/components/app/UserMenu";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: cv } = await supabase
    .from("master_cvs")
    .select("id")
    .eq("user_id", userData.user.id)
    .is("superseded_at", null)
    .maybeSingle();
  const hasCv = Boolean(cv);

  return (
    <AppShell>
      <AmbientBackground />
      <MagneticDots />
      <div className="relative z-10 flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center justify-between border-b border-border/50 bg-dark/70 px-4 backdrop-blur-md sm:h-[72px] sm:px-8">
          <Link
            href="/dashboard"
            className="flex items-baseline gap-3 outline-none focus-visible:opacity-80"
          >
            <span className="font-serif text-2xl font-light tracking-tight text-text sm:text-4xl">
              Distil
            </span>
            <span className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-orange sm:inline">
              Curiosum.ai
            </span>
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-2.5">
            <TopbarNav hasCv={hasCv} />
            <UserMenu email={userData.user.email ?? ""} />
          </nav>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-10 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-[800px]">{children}</div>
        </main>
      </div>
    </AppShell>
  );
}
