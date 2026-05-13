// Topbar wrapper for public-but-auth-aware pages (FAQ, future Pricing /
// Terms / Privacy, etc.). Server component: reads the session and
// chooses between the public LandingTopbar (anon) and the authenticated
// AuthedTopbar (signed in).
//
// The bug this prevents: any page outside the (app) route group that
// hard-codes <LandingTopbar /> will show "Sign in" + "Get started" to
// a signed-in user, which reads as "I've been signed out." Use this
// component instead of LandingTopbar on any page where both authed
// and anonymous visitors are expected.
//
// (app) layout doesn't use this — that subtree is auth-gated, so the
// AuthedTopbar is rendered directly with the data the layout already
// fetches.

import { AuthedTopbar } from "@/components/app/AuthedTopbar";
import { LandingTopbar } from "@/components/landing/LandingTopbar";
import { normaliseRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export async function AuthAwareTopbar() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return <LandingTopbar />;
  }

  const [{ data: cv }, { data: profile }] = await Promise.all([
    supabase
      .from("master_cvs")
      .select("id")
      .eq("user_id", user.id)
      .is("superseded_at", null)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <AuthedTopbar
      email={user.email ?? ""}
      hasCv={Boolean(cv)}
      role={normaliseRole(profile?.role)}
    />
  );
}
