// Single-application page. Branches on application.status:
//   queued | paused | running | rendering → ApplicationLiveView (waiting screen)
//   success                              → CV preview + cover letter + downloads
//   insufficient_input (1/2)             → Screen 9 — retry form
//   insufficient_input (3)               → Screen 10 — abandon-only
//   error | cancelled                    → Failed view + per-row Retry button
//   abandoned                            → Closed view
//
// Server Component fetches the row + queue context. Live state transitions
// are handled by ApplicationLiveView (client) which router.refresh()es on
// terminal phase events. No more "Show submitted job description" expand
// step — submit goes straight to the waiting screen.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlarmClockOffIcon,
  CheckCircleIcon,
  DownloadIcon,
} from "lucide-react";
import { CopyId } from "@/components/app/CopyId";
import { ApplicationLiveView } from "@/components/application/ApplicationLiveView";
import { CoverLetterPreview } from "@/components/application/CoverLetterPreview";
import { CvPreview } from "@/components/application/CvPreview";
import { PagedPreview } from "@/components/application/PagedPreview";
import { RetryAbandonControls } from "@/components/application/RetryAbandonControls";
import { RetryFailedButton } from "@/components/application/RetryFailedButton";
import { createClient } from "@/lib/supabase/server";
import type {
  ApplicationOutput,
  ApplicationOutputSuccess,
} from "@/lib/llm/output-schema";

const FIT_TONE: Record<"strong" | "moderate" | "weak", string> = {
  strong: "bg-success/15 text-success border-success/30",
  moderate: "bg-warn/15 text-warn border-warn/30",
  weak: "bg-danger/15 text-danger border-danger/30",
};

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

// User-facing label for the status pill. Internal enum values like
// "insufficient_input" / "rendering" are noisy in a header row.
const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  paused: "Queued",
  running: "Tailoring",
  rendering: "Tailoring",
  success: "Ready",
  insufficient_input: "Needs more info",
  abandoned: "Abandoned",
  cancelled: "Cancelled",
  error: "Failed",
};

const NON_TERMINAL = new Set(["queued", "paused", "running", "rendering"]);

type RouteCtx = { params: Promise<{ id: string }> };

export default async function ApplicationPage({ params }: RouteCtx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: app } = await supabase
    .from("applications")
    .select(
      "id, user_id, status, attempt_number, queue_position, parent_application_id, job_description, user_notes, region, insufficient_input_reason, error_message, llm_response_json, files_expire_at, files_deleted_at, created_at, started_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!app) notFound();

  const tone =
    STATUS_TONE[app.status] ??
    "bg-dim/15 text-muted-foreground border-border";
  const label = STATUS_LABEL[app.status] ?? app.status;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-text"
        >
          ← Back to Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-lg text-text">Application</h1>
          <CopyId value={id} />
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
          >
            {label}
          </span>
          {app.parent_application_id && (
            <span className="text-xs text-muted-foreground">
              retry of {app.parent_application_id.slice(0, 8)}
            </span>
          )}
        </div>
      </header>

      {NON_TERMINAL.has(app.status) && (
        <ApplicationLiveView
          applicationId={id}
          initialStatus={app.status}
          startedAt={app.started_at}
          createdAt={app.created_at}
        />
      )}

      {app.status === "success" && app.llm_response_json && (
        <SuccessView
          applicationId={id}
          json={app.llm_response_json as ApplicationOutput}
          filesExpireAt={app.files_expire_at}
        />
      )}

      {app.status === "insufficient_input" && (
        <section className="space-y-6">
          <div className="rounded-lg border border-warn/25 bg-warn/10 p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-warn">
              We need more to work with
            </p>
            <p className="mt-2 text-sm text-text">
              {app.insufficient_input_reason ??
                "The inputs didn't give us enough to write a quality application."}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-dark3 p-6">
            <RetryAbandonControls
              applicationId={id}
              attemptNumber={app.attempt_number}
              parentJd={app.job_description}
              parentNotes={app.user_notes}
            />
          </div>
        </section>
      )}

      {(app.status === "error" || app.status === "cancelled") && (
        <section className="rounded-2xl border border-danger/30 bg-danger/10 p-7">
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-danger/40 bg-danger/15 text-danger"
            >
              <AlarmClockOffIcon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-danger">
                {app.status === "cancelled"
                  ? "Run cancelled before it started"
                  : "Generation didn’t finish"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text">
                {app.status === "cancelled"
                  ? "The system never picked this run up — usually because the worker was offline at submit time. Retry now and it’ll go straight through."
                  : (app.error_message ??
                    "We couldn’t finish this run. Retry now or start fresh from the new-application screen.")}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <RetryFailedButton
                  applicationId={id}
                  canRetry={app.attempt_number < 3}
                />
                <Link href="/application/new" className="btn-secondary">
                  New application
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {app.status === "abandoned" && (
        <section className="rounded-lg border border-border bg-dark3 p-6 text-sm text-muted-foreground">
          This application was abandoned. The metadata stays for a year for
          your records.
        </section>
      )}
    </div>
  );
}

function SuccessView({
  applicationId,
  json,
  filesExpireAt,
}: {
  applicationId: string;
  json: ApplicationOutput;
  filesExpireAt: string | null;
}) {
  if (json.status !== "success") return null;
  const success = json as ApplicationOutputSuccess;

  const fit = success.fit_assessment;
  const salary = success.salary_band;
  const fitTone = FIT_TONE[fit.score];
  const firstName =
    success.cv_content.contact_details.full_name.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-8">
      <section className="surface-card">
        <p className="eyebrow">Fit</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${fitTone}`}
          >
            {fit.score}
          </span>
          {salary && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-3 py-1 text-[11px] font-medium text-success">
              {salary.range}
              <span className="text-[10px] uppercase tracking-[0.08em] text-success/70">
                · {salary.confidence}
              </span>
            </span>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-text">
          {fit.reasoning}
        </p>
        {fit.warnings.length > 0 && (
          <>
            <p className="mt-5 eyebrow-muted">Considerations</p>
            <ul className="mt-2 space-y-1.5 text-sm text-text/80">
              {fit.warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-warn" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="surface-card border-orange/30 bg-[var(--color-orange-subtle)]">
        <p className="eyebrow">What we did</p>
        <ul className="mt-4 space-y-2.5">
          {success.what_we_did_checklist.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text">
              <CheckCircleIcon
                size={16}
                aria-hidden
                className="mt-0.5 shrink-0 text-success"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Side-by-side previews. The (app) layout caps content at 720px;
          this section breaks out to ~viewport width via a 50vw negative-
          margin trick so the CV and cover letter sit next to each other
          on wide screens. Stacks vertically below 1024px. Each preview
          panel has its own download icon button at the top-right of
          the panel header, so the action sits next to the artefact it
          downloads instead of in a separate buttons row above. */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-6">
        <div className="mx-auto max-w-[1280px]">
          {/* `items-start` keeps each card at its content height so the
              cover letter doesn't stretch to match the CV's longer body. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="surface-card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="eyebrow">CV preview</p>
                <a
                  href={`/api/applications/${applicationId}/download/cv`}
                  aria-label="Download CV"
                  title="Download CV"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange text-white transition-colors hover:bg-orange-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange/40"
                >
                  <DownloadIcon size={16} aria-hidden />
                </a>
              </div>
              <PagedPreview ariaLabel="CV preview, paginated">
                <CvPreview content={success.cv_content} />
              </PagedPreview>
            </div>
            <div className="surface-card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="eyebrow">Cover letter preview</p>
                <a
                  href={`/api/applications/${applicationId}/download/cover_letter`}
                  aria-label="Download cover letter"
                  title="Download cover letter"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange text-white transition-colors hover:bg-orange-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange/40"
                >
                  <DownloadIcon size={16} aria-hidden />
                </a>
              </div>
              <PagedPreview ariaLabel="Cover letter preview, paginated">
                <CoverLetterPreview
                  content={success.cover_letter_content}
                />
              </PagedPreview>
            </div>
          </div>
        </div>
      </section>

      {/* Warm sign-off. Sits at the very bottom of the success view; first
          name is extracted from contact_details.full_name. Tone matches the
          NZ register of the cover letter (Kia ora / Nga mihi) — explicit
          "good luck" because the user expects to see it as a closing line. */}
      <section className="pt-6 text-center">
        <p className="font-serif text-2xl font-light leading-snug text-text sm:text-3xl">
          {firstName
            ? `Good luck with your application, ${firstName}.`
            : "Good luck with your application."}
        </p>
        <p className="mt-3 font-serif text-base italic text-orange sm:text-lg">
          Kia kaha — you've got this.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Send it through and back yourself.
        </p>
        {filesExpireAt && (
          <p className="mt-6 text-[11px] text-muted-foreground/70">
            Files available until{" "}
            {new Date(filesExpireAt).toLocaleDateString("en-NZ", {
              timeZone: "Pacific/Auckland",
            })}
            .
          </p>
        )}
      </section>
    </div>
  );
}
