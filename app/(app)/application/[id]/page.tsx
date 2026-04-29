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
import { ApplicationLiveView } from "@/components/application/ApplicationLiveView";
import { CoverLetterPreview } from "@/components/application/CoverLetterPreview";
import { CvPreview } from "@/components/application/CvPreview";
import { RetryAbandonControls } from "@/components/application/RetryAbandonControls";
import { createClient } from "@/lib/supabase/server";
import type {
  ApplicationOutput,
  ApplicationOutputSuccess,
} from "@/lib/llm/output-schema";

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
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-lg text-text">
            Application {id.slice(0, 8)}
          </h1>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
          >
            {app.status}
          </span>
          <span className="text-xs text-muted-foreground">
            attempt {app.attempt_number}
          </span>
          {app.parent_application_id && (
            <span className="text-xs text-muted-foreground">
              · retry of {app.parent_application_id.slice(0, 8)}
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

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-dark3 p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Fit
        </p>
        <p className="mt-2 text-sm text-text">
          <strong className="font-semibold capitalize">
            {success.fit_assessment.score}
          </strong>{" "}
          — {success.fit_assessment.reasoning}
        </p>
        {success.fit_assessment.warnings.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-warn">
            {success.fit_assessment.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {success.salary_band && (
          <p className="mt-3 text-xs text-muted-foreground">
            Salary band ({success.salary_band.confidence} confidence):{" "}
            {success.salary_band.range}
          </p>
        )}
      </section>

      <section className="rounded-l-md border-l-[3px] border-orange bg-orange-dim p-5 pl-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          What we did
        </p>
        <ul className="mt-3 space-y-1.5 font-serif text-base italic text-text">
          {success.what_we_did_checklist.map((item, i) => (
            <li key={i}>· {item}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/applications/${applicationId}/download/cv`}
          className="rounded-sm bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light"
        >
          Download CV
        </a>
        <a
          href={`/api/applications/${applicationId}/download/cover_letter`}
          className="rounded-sm bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light"
        >
          Download Cover Letter
        </a>
        {filesExpireAt && (
          <span className="text-xs text-muted-foreground">
            Files available until{" "}
            {new Date(filesExpireAt).toLocaleDateString("en-NZ", {
              timeZone: "Pacific/Auckland",
            })}
          </span>
        )}
      </section>

      <details className="rounded-lg border border-border bg-dark3 p-2" open>
        <summary className="cursor-pointer px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          CV preview
        </summary>
        <div className="p-4">
          <CvPreview content={success.cv_content} />
        </div>
      </details>

      <details className="rounded-lg border border-border bg-dark3 p-2">
        <summary className="cursor-pointer px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Cover letter preview
        </summary>
        <div className="p-4">
          <CoverLetterPreview content={success.cover_letter_content} />
        </div>
      </details>
    </div>
  );
}
