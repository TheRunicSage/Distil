// Single-application page. Branches on application.status:
//   queued | paused        → Screen "Queued, position N of M"
//   running | rendering    → Screen 8 loading (SSE-driven via client)
//   success                → CV preview + cover letter preview + downloads
//   insufficient_input (1/2)→ Screen 9 — retry form
//   insufficient_input (3) → Screen 10 — continue queue
//   error                  → Screen 12 — error + retry hint
//   abandoned | cancelled  → terminal "Closed" view
//
// Server Component fetches the row + queue context and the appropriate
// presentation. Live state transitions are handled by ApplicationLiveView
// (client) which router.refresh()es on terminal phase events.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircleIcon } from "lucide-react";
import { CopyId } from "@/components/app/CopyId";
import { ApplicationLiveView } from "@/components/application/ApplicationLiveView";
import { CoverLetterPreview } from "@/components/application/CoverLetterPreview";
import { CvPreview } from "@/components/application/CvPreview";
import { RetryAbandonControls } from "@/components/application/RetryAbandonControls";
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

  let queueInfo: { position: number; total: number } | null = null;
  if (app.status === "queued" || app.status === "paused") {
    const { data: queue } = await supabase
      .from("applications")
      .select("id, queue_position")
      .eq("user_id", userData.user.id)
      .in("status", ["queued", "paused", "running", "rendering"])
      .order("queue_position", { ascending: true });
    const list = queue ?? [];
    const idx = list.findIndex((r) => r.id === id);
    queueInfo = { position: idx + 1, total: list.length };
  }

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
            {app.status}
          </span>
          {app.parent_application_id && (
            <span className="text-xs text-muted-foreground">
              retry of {app.parent_application_id.slice(0, 8)}
            </span>
          )}
        </div>
      </header>

      {(app.status === "queued" || app.status === "paused") && queueInfo && (
        <section className="rounded-lg border border-border bg-dark3 p-6">
          <p className="text-sm text-text">
            Queued, position {queueInfo.position} of {queueInfo.total}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            We&apos;ll start as soon as the previous run finishes.
          </p>
          <ReadOnlyInputs jd={app.job_description} notes={app.user_notes} />
        </section>
      )}

      {(app.status === "running" || app.status === "rendering") && (
        <ApplicationLiveView
          applicationId={id}
          initialStatus={app.status}
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

      {app.status === "error" && (
        <section className="rounded-lg border border-danger/25 bg-danger/10 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-danger">
            Something went wrong
          </p>
          <p className="mt-2 text-sm text-text">
            {app.error_message ??
              "We couldn't finish this run. Try submitting again."}
          </p>
          <Link
            href="/application/new"
            className="mt-4 inline-block rounded-sm bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light"
          >
            New application
          </Link>
        </section>
      )}

      {(app.status === "abandoned" || app.status === "cancelled") && (
        <section className="rounded-lg border border-border bg-dark3 p-6 text-sm text-muted-foreground">
          This application was {app.status}. The metadata stays for a year
          for your records.
        </section>
      )}
    </div>
  );
}

function ReadOnlyInputs({
  jd,
  notes,
}: {
  jd: string;
  notes: string | null;
}) {
  return (
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-text">
        Show submitted job description
      </summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-dark2 p-3 font-sans text-xs text-text/90">
        {jd}
      </pre>
      {notes && (
        <>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            Notes
          </p>
          <pre className="mt-1 whitespace-pre-wrap rounded-sm border border-border bg-dark2 p-3 font-sans text-xs text-text/90">
            {notes}
          </pre>
        </>
      )}
    </details>
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

      <section className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/applications/${applicationId}/download/cv`}
          className="btn-primary"
        >
          Download CV
        </a>
        <a
          href={`/api/applications/${applicationId}/download/cover_letter`}
          className="btn-primary"
        >
          Download cover letter
        </a>
        {filesExpireAt && (
          <span className="text-meta">
            Files available until{" "}
            {new Date(filesExpireAt).toLocaleDateString("en-NZ", {
              timeZone: "Pacific/Auckland",
            })}
          </span>
        )}
      </section>

      {/* Side-by-side previews. The (app) layout caps content at 720px;
          this section breaks out to ~viewport width via a 50vw negative-
          margin trick so the CV and cover letter sit next to each other
          on wide screens. Stacks vertically below 1024px. Always-open —
          previously each was inside a <details> the user had to expand. */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-6">
        <div className="mx-auto max-w-[1280px]">
          {/* `items-start` keeps each card at its content height so the
              cover letter doesn't stretch to match the CV's longer body. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="surface-card">
              <p className="eyebrow mb-4">CV preview</p>
              <CvPreview content={success.cv_content} />
            </div>
            <div className="surface-card">
              <p className="eyebrow mb-4">Cover letter preview</p>
              <CoverLetterPreview content={success.cover_letter_content} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
