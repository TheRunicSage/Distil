// Settings. Home for low-frequency actions: account, master CV
// management, admin entry (gated), and sign-out. The dashboard
// intentionally no longer shows the master CV card; everything that
// modifies "you" rather than "an application" lives here.

import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NZ", {
    timeZone: "Pacific/Auckland",
  });
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [profileRes, cvRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_admin, created_at")
      .eq("id", userData.user.id)
      .maybeSingle(),
    supabase
      .from("master_cvs")
      .select("id, mime_type, file_size_bytes, created_at")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const cv = cvRes.data;

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Account</p>
        <h1 className="heading-display mt-3">Settings</h1>
      </header>

      <section className="surface-card">
        <p className="eyebrow">Account</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-text">{userData.user.email}</dd>
          </div>
          {profile?.created_at && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="text-text">{formatDate(profile.created_at)}</dd>
            </div>
          )}
          {profile?.is_admin && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="text-orange">Admin</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="surface-card">
        <p className="eyebrow">Master CV</p>
        {cv ? (
          <>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Format</dt>
                <dd className="text-text">
                  {cv.mime_type === "application/pdf" ? "PDF" : "DOCX"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Size</dt>
                <dd className="text-text">
                  {Math.round(cv.file_size_bytes / 1024)} KB
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Uploaded</dt>
                <dd className="text-text">{formatDate(cv.created_at)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Replacing your CV won&apos;t affect applications already in the
              queue. They keep using the snapshot from when they were
              submitted.
            </p>
            <div className="mt-5">
              <Link href="/upload" className="btn-secondary">
                Replace master CV
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-text">No master CV on file yet.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Upload one PDF or DOCX (up to 3MB) before tailoring an
              application.
            </p>
            <div className="mt-5">
              <Link href="/upload" className="btn-primary">
                Upload CV
              </Link>
            </div>
          </>
        )}
      </section>

      {profile?.is_admin && (
        <section className="surface-card">
          <p className="eyebrow">Admin tools</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Internal observability for the admin user.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href="/admin/usage" className="btn-link-orange">
                Usage — last 50 applications →
              </Link>
            </li>
            <li>
              <Link href="/admin/logs" className="btn-link-orange">
                Logs — recent errors →
              </Link>
            </li>
            <li>
              <Link href="/admin/telemetry" className="btn-link-orange">
                Telemetry — 7-day cost total →
              </Link>
            </li>
          </ul>
        </section>
      )}

      <section className="surface-card">
        <p className="eyebrow">Session</p>
        <p className="mt-4 text-sm text-muted-foreground">
          End your session on this device.
        </p>
        <form action={signOut} className="mt-5">
          <button type="submit" className="btn-secondary">
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
