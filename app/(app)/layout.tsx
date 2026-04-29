// Authenticated app shell. Topbar with primary nav and sign-out.
// proxy.ts already gates protected paths; this component just paints
// chrome around server-rendered children.

import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "CV" },
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  const isAdmin = profile?.is_admin === true;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-[50px] shrink-0 items-center justify-between border-b border-border bg-dark2 px-6">
        <Link
          href="/dashboard"
          className="flex items-baseline gap-2"
        >
          <span className="font-serif italic text-lg text-text">Distil</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange/80">
            by Curiosum
          </span>
        </Link>
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
          {isAdmin && (
            <Link
              href="/admin/usage"
              className="rounded-sm px-3 py-1.5 text-sm text-orange transition-colors hover:bg-dark4"
            >
              Admin
            </Link>
          )}
          <form action={signOut} className="ml-2">
            <button
              type="submit"
              className="rounded-sm border border-border px-3 py-1.5 text-sm text-text/80 transition-colors hover:bg-dark4"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
