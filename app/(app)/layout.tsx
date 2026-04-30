// Authenticated app shell. Topbar with primary nav and sign-out.
// proxy.ts already gates protected paths; this component just paints
// chrome around server-rendered children.

import Link from "next/link";
import { redirect } from "next/navigation";
import { AmbientBackground } from "@/components/app/AmbientBackground";
import { AppShell } from "@/components/app/AppShell";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
] as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  return (
    <AppShell>
      <AmbientBackground />
      <div className="relative z-10 flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[56px] shrink-0 items-center justify-between border-b border-border/50 bg-dark/70 px-6 backdrop-blur-md">
          <Link href="/dashboard" className="flex items-baseline gap-3">
            <span className="font-serif text-2xl font-light tracking-tight text-text">
              Distil
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange">
              Curiosum.ai
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-dark3 hover:text-text"
              >
                {item.label}
              </Link>
            ))}
            <span
              aria-hidden
              className="ml-2 hidden text-[10px] text-muted-foreground sm:inline"
            >
              Press{" "}
              <kbd className="rounded-sm border border-border bg-dark3 px-1.5 py-0.5 font-mono text-[10px]">
                ?
              </kbd>{" "}
              for shortcuts
            </span>
          </nav>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-12">
          <div className="mx-auto max-w-[720px]">{children}</div>
        </main>
      </div>
    </AppShell>
  );
}
