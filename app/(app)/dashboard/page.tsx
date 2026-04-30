// Dashboard. Single job: show the user where they are and what to do
// next. Master CV management lives in /settings, not here.
//
// Three states:
//   1. No CV → full-width "upload to get started" card. (The post-login
//      redirect routes here only if the topbar still got hit; this is a
//      defensive empty-state.)
//   2. Has CV, has live work → "In progress" panel + "Recent" list of
//      terminal-state applications.
//   3. Has CV, no live work, no history → "Tailor your first
//      application" CTA.
//
// "Live" = queued | paused | running | rendering. "Recent" excludes
// these so the same row isn't shown twice.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  success: "bg-success/15 text-success border-success/25",
  queued: "bg-info/15 text-info border-info/25",
  paused: "bg-warn/15 text-warn border-warn/25",
  running: "bg-warn/15 text-warn border-warn/25",
  rendering: "bg-warn/15 text-warn border-warn/25",
  insufficient_input: "bg-warn/15 text-warn border-warn/25",
  abandoned: "bg-dim/15 text-muted-foreground border-border",
  cancelled: "bg-dim/15 text-muted-foreground border-border",
  error: "bg-danger/15 text-danger border-danger/25",
};

const LIVE_STATUSES = [
  "queued",
  "paused",
  "running",
  "rendering",
] as const;

type AppRow = {
  id: string;
  status: string;
  attempt_number: number;
  created_at: string;
  completed_at: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusPill({ status }: { status: string }) {
  const tone =
    STATUS_TONE[status] ?? "bg-dim/15 text-muted-foreground border-border";
  return (
    <span className={`status-pill ${tone}`}>{status.replace("_", " ")}</span>
  );
}

function ApplicationRow({ app }: { app: AppRow }) {
  return (
    <Link href={`/application/${app.id}`} className="surface-row">
      <span className="font-mono text-xs text-text">{app.id.slice(0, 8)}</span>
      <span className="text-xs text-muted-foreground">
        attempt {app.attempt_number}
      </span>
      <StatusPill status={app.status} />
      <span className="text-xs text-muted-foreground">
        {formatDate(app.created_at)}
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [cvRes, liveRes, recentRes] = await Promise.all([
    supabase
      .from("master_cvs")
      .select("id")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, status, attempt_number, created_at, completed_at")
      .in("status", LIVE_STATUSES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("applications")
      .select("id, status, attempt_number, created_at, completed_at")
      .not("started_at", "is", null)
      .not("status", "in", `(${LIVE_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const hasCv = Boolean(cvRes.data);
  const live: AppRow[] = liveRes.data ?? [];
  const recent: AppRow[] = recentRes.data ?? [];
  const hasAnyHistory = live.length > 0 || recent.length > 0;

  return (
    <div className="space-y-12">
      <header className="text-center">
        <p className="eyebrow">Welcome back</p>
        <h1 className="heading-display mt-3">Pick up where you left off.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your CV, stripped to its sharpest form. ATS ready, recruiter approved.
        </p>
      </header>

      {!hasCv && (
        <section className="surface-card text-center">
          <p className="eyebrow">Get started</p>
          <h2 className="heading-section mt-3">
            Upload your master CV first.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            One PDF or DOCX, up to 3MB. We&apos;ll use it as the source of truth
            for every tailored application.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/upload" className="btn-primary">
              Upload CV
            </Link>
          </div>
        </section>
      )}

      {hasCv && !hasAnyHistory && (
        <section className="surface-card text-center">
          <p className="eyebrow">Ready</p>
          <h2 className="heading-section mt-3">
            Tailor your first application.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Paste a job description. Get a tailored CV and cover letter, both
            matched to the role.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/application/new" className="btn-primary">
              Tailor a new application
            </Link>
          </div>
        </section>
      )}

      {hasCv && live.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="eyebrow-muted">In progress</h2>
            <span className="text-meta">
              {live.length} {live.length === 1 ? "application" : "applications"}
            </span>
          </div>
          <ul className="space-y-2">
            {live.map((app) => (
              <li key={app.id}>
                <ApplicationRow app={app} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasCv && recent.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="eyebrow-muted">Recent</h2>
            <Link href="/history" className="text-meta hover:text-text">
              View all →
            </Link>
          </div>
          <ul className="space-y-2">
            {recent.map((app) => (
              <li key={app.id}>
                <ApplicationRow app={app} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
