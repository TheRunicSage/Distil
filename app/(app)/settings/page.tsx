// Settings. Home for low-frequency actions: account, master CV
// management, admin entry (gated), and sign-out. The dashboard
// intentionally no longer shows the master CV card; everything that
// modifies "you" rather than "an application" lives here.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon, DownloadIcon } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { FadeUp } from "@/components/app/FadeUp";
import { MissingFieldsBadge } from "@/components/app/MissingFieldsBadge";
import { DeleteAccountForm } from "@/components/settings/DeleteAccountForm";
import type { MissingFieldCode } from "@/lib/parsing/detect-missing-fields";
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
      .select("id, mime_type, file_size_bytes, created_at, missing_fields")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const cv = cvRes.data as
    | {
        id: string;
        mime_type: string;
        file_size_bytes: number;
        created_at: string;
        missing_fields: MissingFieldCode[] | null;
      }
    | null;

  return (
    <div className="space-y-8">
      <FadeUp mode="mount" as="header">
        <p className="eyebrow">Account</p>
        <h1 className="heading-display mt-3">Settings</h1>
      </FadeUp>

      <FadeUp mode="mount" delay={80} as="section" className="surface-card">
        <p className="eyebrow">Account</p>
        <dl className="mt-5 space-y-2.5 text-base">
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
      </FadeUp>

      <FadeUp mode="mount" delay={160} as="section" className="surface-card">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">Master CV</p>
          {cv?.missing_fields && cv.missing_fields.length > 0 && (
            <MissingFieldsBadge fields={cv.missing_fields} variant="parse" />
          )}
        </div>
        {cv ? (
          <>
            <dl className="mt-5 space-y-2.5 text-base">
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
            <p className="mt-5 text-sm text-muted-foreground">
              Replacing your CV won&apos;t affect applications already in the
              queue. They keep using the snapshot from when they were
              submitted.
            </p>
            {/* Download routes through /api/master-cv/download which
                redirects to a 60-second signed Supabase URL. Icon
                button for primary affordance; "Replace" stays
                secondary so the read action reads first. */}
            <div className="mt-6 flex flex-wrap gap-3">
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
            <p className="mt-5 text-base text-text">No master CV on file yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload one PDF or DOCX (up to 3MB) before tailoring an
              application.
            </p>
            <div className="mt-6">
              <Link href="/upload" className="btn-primary">
                Upload CV
              </Link>
            </div>
          </>
        )}
      </FadeUp>

      {profile?.is_admin && (
        <FadeUp mode="mount" delay={240} as="section">
          <div className="mb-4">
            <p className="eyebrow">Admin tools</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Internal observability for the admin user.
            </p>
          </div>
          <ul className="space-y-2">
            <li>
              <Link href="/admin/usage" className="surface-row">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-medium text-text">Usage</span>
                  <span className="text-sm text-muted-foreground">
                    Last 50 applications
                  </span>
                </div>
                <ChevronRightIcon
                  size={16}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
            <li>
              <Link href="/admin/logs" className="surface-row">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-medium text-text">Errors</span>
                  <span className="text-sm text-muted-foreground">
                    Recent errors
                  </span>
                </div>
                <ChevronRightIcon
                  size={16}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
            <li>
              <Link href="/admin/telemetry" className="surface-row">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-medium text-text">Telemetry</span>
                  <span className="text-sm text-muted-foreground">
                    7-day cost total
                  </span>
                </div>
                <ChevronRightIcon
                  size={16}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          </ul>
        </FadeUp>
      )}

      {/* Condensed view of the standards + data treatment we publish
          on /faq — same source claims, abbreviated for in-app context.
          Designed so a logged-in user can verify what we hold without
          tab-switching to the public FAQ. */}
      <FadeUp mode="mount" delay={profile?.is_admin ? 320 : 240} as="section" className="surface-card">
        <p className="eyebrow">Standards & your data</p>
        <ul className="mt-5 space-y-3 text-base text-muted-foreground">
          <li className="flex items-baseline gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">ATS-safe by default.</strong>{" "}
              Industry-standard structure and section labels that
              mainstream parsers read reliably.
            </span>
          </li>
          <li className="flex items-baseline gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">Encrypted at rest + in transit.</strong>{" "}
              AES-256 storage, TLS in transit. Private to your
              account.
            </span>
          </li>
          <li className="flex items-baseline gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">Auto-deleted on schedule.</strong>{" "}
              Generated files after 60 days; application metadata
              after 1 year. Your master CV is replaced when you
              upload a new one.
            </span>
          </li>
          <li className="flex items-baseline gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange/70" aria-hidden />
            <span>
              <strong className="text-text">Not used to train AI models.</strong>{" "}
              We don't train any models on your data, and we don't
              sell or share it beyond what's strictly required to
              generate your documents.
            </span>
          </li>
        </ul>
        <Link href="/faq" className="btn-link-orange mt-6 inline-block">
          Read the full FAQ →
        </Link>
      </FadeUp>

      <FadeUp mode="mount" delay={profile?.is_admin ? 400 : 320} as="section" className="surface-card">
        <p className="eyebrow">Session</p>
        <p className="mt-5 text-base text-muted-foreground">
          End your session on this device.
        </p>
        <form action={signOut} className="mt-6">
          <button type="submit" className="btn-secondary">
            Sign out
          </button>
        </form>
      </FadeUp>

      <FadeUp mode="mount" delay={profile?.is_admin ? 480 : 400} as="section" className="surface-card border-danger/30">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">
          Danger zone
        </p>
        <DeleteAccountForm email={userData.user.email ?? ""} />
      </FadeUp>
    </div>
  );
}
