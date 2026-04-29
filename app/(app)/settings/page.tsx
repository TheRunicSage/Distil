// Settings. v1 is intentionally minimal: surface the user's email,
// admin status, link to upload, and sign-out. Account deletion +
// email change are deferred with magic-link auth.

import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, created_at")
    .eq("id", userData.user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text">Settings</h1>
      </header>

      <section className="rounded-lg border border-border bg-dark3 p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Account
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-text">{userData.user.email}</dd>
          </div>
          {profile?.created_at && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="text-text">
                {new Date(profile.created_at).toLocaleDateString("en-NZ", {
                  timeZone: "Pacific/Auckland",
                })}
              </dd>
            </div>
          )}
          {profile?.is_admin && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="text-orange">Admin</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-dark3 p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Master CV
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          One CV on file at a time. Replace it on the upload page.
        </p>
        <Link
          href="/upload"
          className="mt-3 inline-block text-sm text-orange hover:text-orange-light"
        >
          Manage master CV →
        </Link>
      </section>

      <section className="rounded-lg border border-border bg-dark3 p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Session
        </p>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="rounded-sm border border-border bg-dark3 px-4 py-2 text-sm text-text/80 transition-colors hover:bg-dark4"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
