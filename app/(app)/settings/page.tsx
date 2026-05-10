// Settings. Home for low-frequency actions: account, master CV
// management, admin entry (gated), and sign-out. The dashboard
// intentionally no longer shows the master CV card; everything that
// modifies "you" rather than "an application" lives here.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon, DownloadIcon } from "lucide-react";
import { DeleteAccountForm } from "@/components/settings/DeleteAccountForm";
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
        <h1 className="heading-display mt-4">Settings</h1>
      </header>

      <section className="surface-card">
        <p className="eyebrow">Account</p>
        <dl className="mt-6 space-y-3 text-lg">
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
            <dl className="mt-6 space-y-3 text-lg">
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
            <p className="mt-6 text-base text-muted-foreground">
              Replacing your CV won&apos;t affect applications already in the
              queue. They keep using the snapshot from when they were
              submitted.
            </p>
            {/* Download routes through /api/master-cv/download which
                redirects to a 60-second signed Supabase URL. Icon
                button for primary affordance; "Replace" stays
                secondary so the read action reads first. */}
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="/api/master-cv/download"
                className="btn-primary"
                aria-label="Download your master CV"
              >
                <DownloadIcon size={18} aria-hidden />
                Download CV
              </a>
              <Link href="/upload" className="btn-secondary">
                Replace master CV
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-6 text-lg text-text">No master CV on file yet.</p>
            <p className="mt-3 text-base text-muted-foreground">
              Upload one PDF or DOCX (up to 3MB) before tailoring an
              application.
            </p>
            <div className="mt-7">
              <Link href="/upload" className="btn-primary">
                Upload CV
              </Link>
            </div>
          </>
        )}
      </section>

      {profile?.is_admin && (
        <section>
          <div className="mb-6">
            <p className="eyebrow">Admin tools</p>
            <p className="mt-3 text-lg text-muted-foreground">
              Internal observability for the admin user.
            </p>
          </div>
          <ul className="space-y-3">
            <li>
              <Link href="/admin/usage" className="surface-row">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-medium text-text">Usage</span>
                  <span className="text-base text-muted-foreground">
                    Last 50 applications
                  </span>
                </div>
                <ChevronRightIcon
                  size={18}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
            <li>
              <Link href="/admin/logs" className="surface-row">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-medium text-text">Errors</span>
                  <span className="text-base text-muted-foreground">
                    Recent errors
                  </span>
                </div>
                <ChevronRightIcon
                  size={18}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
            <li>
              <Link href="/admin/telemetry" className="surface-row">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-medium text-text">Telemetry</span>
                  <span className="text-base text-muted-foreground">
                    7-day cost total
                  </span>
                </div>
                <ChevronRightIcon
                  size={18}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          </ul>
        </section>
      )}

      {/* Condensed view of the standards + data treatment we publish
          on /faq — same source claims, abbreviated for in-app context.
          Designed so a logged-in user can verify what we hold without
          tab-switching to the public FAQ. */}
      <section className="surface-card">
        <p className="eyebrow">Standards & your data</p>
        <ul className="mt-7 space-y-4 text-lg text-muted-foreground">
          <li className="flex items-baseline gap-3">
            <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">ATS-safe by default.</strong>{" "}
              Industry-standard structure and section labels that
              mainstream parsers read reliably.
            </span>
          </li>
          <li className="flex items-baseline gap-3">
            <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">Encrypted at rest + in transit.</strong>{" "}
              AES-256 storage, TLS in transit. Private to your
              account.
            </span>
          </li>
          <li className="flex items-baseline gap-3">
            <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">Auto-deleted on schedule.</strong>{" "}
              Generated files after 60 days; application metadata
              after 1 year. Your master CV is replaced when you
              upload a new one.
            </span>
          </li>
          <li className="flex items-baseline gap-3">
            <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">Not used to train AI models.</strong>{" "}
              We don't train any models on your data, and we don't
              sell or share it beyond what's strictly required to
              generate your documents.
            </span>
          </li>
        </ul>
        <Link href="/faq" className="btn-link-orange mt-7 inline-block">
          Read the full FAQ →
        </Link>
      </section>

      {/* Session / Sign out moved into the UserMenu dropdown in the
          topbar (UI refresh phase 5, 2026-05-10). The dropdown is the
          single source for high-frequency actions like signing out. */}

      <section className="surface-card border-danger/30">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-danger">
          Danger zone
        </p>
        <DeleteAccountForm email={userData.user.email ?? ""} />
      </section>
    </div>
  );
}
