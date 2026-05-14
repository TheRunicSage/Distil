// Authenticated app shell. Topbar uses the design-system classes from
// globals.css so spacing/typography stay aligned across (app) pages.
//
// IA: the Distil wordmark is the only "home" affordance (links to
// /dashboard); the History link is secondary nav; Settings collapses
// behind a gear icon (account, master CV, admin, sign-out all live
// there); "+ New application" is the always-visible primary action.
// When the user has no master CV, the same button routes to /upload
// with a context-appropriate label rather than dead-ending on a
// "you need to upload first" message.

import { redirect } from "next/navigation";
import { AmbientBackground } from "@/components/app/AmbientBackground";
import { AppShell } from "@/components/app/AppShell";
import { AuthedTopbar } from "@/components/app/AuthedTopbar";
import { MagneticDots } from "@/components/app/MagneticDots";
import { normaliseRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [{ data: cv }, { data: profile }] = await Promise.all([
    supabase
      .from("master_cvs")
      .select("id")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle(),
  ]);
  const hasCv = Boolean(cv);
  const role = normaliseRole(profile?.role);
  const email = userData.user.email ?? "";

  return (
    <AppShell>
      <AmbientBackground variant="authed" />
      <MagneticDots />
      <div className="relative z-10 flex flex-1 flex-col">
        <AuthedTopbar hasCv={hasCv} email={email} role={role} />
        <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
          <div className="mx-auto max-w-[760px]">{children}</div>
        </main>
      </div>
    </AppShell>
  );
}
