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
  ArrowLeftIcon,
  BanIcon,
  PauseIcon,
  PencilIcon,
} from "lucide-react";
import { CopyId } from "@/components/app/CopyId";
import { FadeUp } from "@/components/app/FadeUp";
import {
  MissingFieldsBadge,
  computeOutputMissingFields,
} from "@/components/app/MissingFieldsBadge";
import { ApplicationLiveView } from "@/components/application/ApplicationLiveView";
import { BehindApplicationHover } from "@/components/application/BehindApplicationHover";
import { CoverLetterPreview } from "@/components/application/CoverLetterPreview";
import { CvPreview } from "@/components/application/CvPreview";
import { EmailMeButton } from "@/components/application/EmailMeButton";
import { PreviewPanel } from "@/components/application/PreviewPanel";
import { RetryAbandonControls } from "@/components/application/RetryAbandonControls";
import { RetryFailedButton } from "@/components/application/RetryFailedButton";
import { HoverHint } from "@/components/ui/HoverHint";
import { isAdmin as isAdminRole, normaliseRole } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  ERROR_CODES,
  type ErrorCode,
  type RecoveryKind,
} from "@/lib/errors/codes";
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
      "id, user_id, status, attempt_number, queue_position, parent_application_id, job_description, user_notes, region, insufficient_input_reason, error_message, llm_response_json, files_expire_at, files_deleted_at, created_at, started_at, completed_at, last_emailed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!app) notFound();

  // Admin gate for the ID-copy pill in the header. Regular users
  // don't need to see the row's UUID; admins use it for support /
  // log lookups. Same shape as other admin gates in this codebase
  // (see (app)/layout.tsx, settings/page.tsx).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  const isAdmin = isAdminRole(normaliseRole(profile?.role));

  const tone =
    STATUS_TONE[app.status] ??
    "bg-dim/15 text-muted-foreground border-border";
  const label = STATUS_LABEL[app.status] ?? app.status;

  // Hoist the success-shape JSON so the header can render Fit +
  // Salary pills in the same row as Files-available (per user
  // request 2026-05-13). Other branches don't touch this.
  const successJson =
    app.status === "success" &&
    app.llm_response_json &&
    (app.llm_response_json as ApplicationOutput).status === "success"
      ? (app.llm_response_json as ApplicationOutputSuccess)
      : null;
  const headerFit = successJson?.fit_assessment ?? null;
  const headerSalary = successJson?.salary_band ?? null;

  // For error states, look up the latest error_code from request_logs and
  // map it to a recovery descriptor. Drives which branch the error
  // section renders below — input-fixable errors get the inline retry
  // form; transient (system) errors get a soft "we've been notified"
  // retry; non_recoverable / system_paused get explanatory dead-ends.
  // Service-role client because request_logs is admin-RLS gated.
  let recovery: {
    kind: RecoveryKind;
    headline: string;
    hint: string | null;
  } | null = null;
  if (app.status === "error") {
    const service = createServiceClient();
    const { data: latestErr } = await service
      .from("request_logs")
      .select("error_code")
      .eq("application_id", id)
      .not("error_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const code = (latestErr?.error_code as ErrorCode | null) ?? null;
    const entry = code ? ERROR_CODES[code] : null;
    if (entry && entry.recovery_kind !== "no_recovery") {
      recovery = {
        kind: entry.recovery_kind,
        headline: entry.recovery_headline,
        hint: entry.recovery_hint,
      };
    } else {
      // No coded error reached request_logs OR the code's recovery_kind
      // is no_recovery (auth / submit-time validation that shouldn't
      // land here). Fall back to transient — the soft "we've been
      // notified" retry is the right shape for unknown failures.
      recovery = {
        kind: "transient",
        headline: ERROR_CODES.internal_error.recovery_headline,
        hint: ERROR_CODES.internal_error.recovery_hint,
      };
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/dashboard" className="btn-pill">
          <ArrowLeftIcon size={14} aria-hidden />
          Back to Dashboard
        </Link>
        {/* Header row — slimmed down 2026-05-13:
            - "Application" heading text removed (title pill below
              carries the role @ company name).
            - ID copy pill gated on isAdmin; regular users don't need
              the row UUID surfaced.
            - Status pill dropped on the success branch ("Ready" was
              redundant with the visible CV + cover letter previews);
              still rendered for queued / running / error / etc. where
              it carries real status signal.
            - On success, Fit + Salary verdict pills move up here from
              the SuccessView title block — one consolidated meta row
              with files-expiry + verdicts.
            - `justify-center` so the row is always centred. With
              `flex-wrap`, a long salary chip (e.g. "NZD 145,000 to
              175,000 · MEDIUM") that doesn't fit drops to its own
              line and re-centres there — keeps the row polished on
              every viewport / verdict combo. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {isAdmin && <CopyId value={id} />}
          {app.status !== "success" && (
            <span className={`status-pill ${tone}`}>{label}</span>
          )}
          {app.parent_application_id && (
            <span className="text-sm text-muted-foreground">
              retry of {app.parent_application_id.slice(0, 8)}
            </span>
          )}
          {app.status === "success" && app.files_expire_at && (
            <span className="text-sm text-muted-foreground">
              Files available until{" "}
              {new Date(app.files_expire_at).toLocaleDateString("en-NZ", {
                timeZone: "Pacific/Auckland",
              })}
            </span>
          )}
          {headerFit && (
            <HoverHint
              title={`Fit · ${headerFit.score}`}
              trigger={
                <span
                  className={`inline-flex cursor-help items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] shadow-sm transition-all duration-200 hover:-translate-y-px hover:scale-[1.04] hover:shadow-md hover:brightness-110 ${FIT_TONE[headerFit.score]}`}
                >
                  Fit · {headerFit.score}
                </span>
              }
            >
              {/* Bulleted scale per user request — much easier to read
                  than the previous wall-of-text version. Three rungs,
                  each one line, with the score name in brand orange
                  so the eye lands on the rung the user's chip matches. */}
              <span className="block">
                How well the role&apos;s must-haves align with your
                evidenced experience.
              </span>
              <ul className="mt-2 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                  />
                  <span>
                    <strong className="font-semibold text-success">
                      Strong
                    </strong>{" "}
                    — close match across the board.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
                  />
                  <span>
                    <strong className="font-semibold text-warn">
                      Moderate
                    </strong>{" "}
                    — most align, with one or two real gaps.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
                  />
                  <span>
                    <strong className="font-semibold text-danger">
                      Weak
                    </strong>{" "}
                    — a stretch (often a domain or seniority pivot).
                  </span>
                </li>
              </ul>
              <span className="mt-2 block text-muted-foreground">
                Descriptive only — Distil still tailors the full
                application either way.
              </span>
            </HoverHint>
          )}
          {headerSalary && (
            <HoverHint
              title={`Salary · ${headerSalary.confidence} confidence`}
              trigger={
                <span className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-3 py-1 text-xs font-medium text-success shadow-sm transition-all duration-200 hover:-translate-y-px hover:scale-[1.04] hover:shadow-md hover:brightness-110">
                  {headerSalary.range}
                  <span className="text-[11px] uppercase tracking-[0.08em] text-success/70">
                    · {headerSalary.confidence}
                  </span>
                </span>
              }
            >
              Estimated band for this role + seniority + region, pulled
              from public listings via live web search at generation
              time. Confidence reflects how many sources agreed — treat
              it as a sense-check, not a binding number.
            </HoverHint>
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
          lastEmailedAt={app.last_emailed_at}
        />
      )}

      {app.status === "insufficient_input" && (
        <section className="space-y-5">
          <div className="rounded-lg border border-warn/25 bg-warn/10 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-warn">
              We need more to work with
            </p>
            <p className="mt-3 text-base text-text">
              {app.insufficient_input_reason ??
                "The inputs didn't give us enough to write a quality application."}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-dark3 p-6">
            <RetryAbandonControls
              applicationId={id}
              attemptNumber={app.attempt_number}
              parentJd={app.job_description}
            />
          </div>
        </section>
      )}

      {app.status === "cancelled" && (
        <section className="rounded-2xl border border-danger/30 bg-danger/10 p-7">
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-danger/40 bg-danger/15 text-danger"
            >
              <AlarmClockOffIcon size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-danger">
                Run cancelled before it started
              </p>
              <p className="mt-3 text-base leading-relaxed text-text">
                The system never picked this run up — usually because the
                worker was offline at submit time. Retry now and it&apos;ll
                go straight through.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
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

      {app.status === "error" && recovery && (
        <ErrorRecoverySection
          applicationId={id}
          recovery={recovery}
          attemptNumber={app.attempt_number}
          parentJd={app.job_description}
          rawErrorMessage={app.error_message}
        />
      )}

      {app.status === "abandoned" && (
        <section className="rounded-lg border border-border bg-dark3 p-6 text-base text-muted-foreground">
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
  lastEmailedAt,
}: {
  applicationId: string;
  json: ApplicationOutput;
  lastEmailedAt: string | null;
}) {
  if (json.status !== "success") return null;
  const success = json as ApplicationOutputSuccess;

  const fit = success.fit_assessment;
  const firstName =
    success.cv_content.contact_details.full_name.trim().split(/\s+/)[0] ?? "";

  // Output-time missing-field check: scans the rendered contact_details
  // for null / single-word-name. Distinct signal from the master CV's
  // parse-time badge (which scanned the raw CV text) — this is "what
  // this specific generation came out missing", a soft reminder that
  // future applications could be richer if the user fills the master
  // CV gaps. Returns [] when everything's present, badge auto-hides.
  const outputMissing = computeOutputMissingFields({
    full_name: success.cv_content.contact_details.full_name,
    phone: success.cv_content.contact_details.phone,
    email: success.cv_content.contact_details.email,
    linkedin: success.cv_content.contact_details.linkedin,
  });

  // Application title — mirrors the dashboard / ChainCard derivation
  // (lib/applications/chains.ts deriveTitle). The success view already
  // has the structured JSON in scope, so derive inline rather than
  // hop through the chain helpers.
  const roleArchetype = success.jd_analysis?.role_archetype?.trim() ?? "";
  const companyName =
    success.cover_letter_content?.header?.company_name?.trim() ?? "";
  const applicationTitle =
    roleArchetype && companyName
      ? `${roleArchetype} @ ${companyName}`
      : roleArchetype || companyName || null;
  // Inline " role @ company " when both segments are short enough to
  // sit on one line at the desktop pill size. Above the threshold,
  // stack each on its own row (role / @ / company) so a long title
  // reads neatly instead of producing a mid-word line break. 30 chars
  // combined is a practical floor: most NZ titles like "Data Analyst
  // @ Auckland Council" (~30) stay inline; long ones like "Principal
  // Site Reliability Engineer @ Te Whatu Ora Health New Zealand"
  // (~70) stack cleanly.
  const titleHasBoth = Boolean(roleArchetype && companyName);
  const isLongTitle =
    titleHasBoth && roleArchetype.length + companyName.length > 30;

  return (
    <div className="space-y-5">
      {/* Top stack — title pill with hover/click reveal of "Behind
          this application" (consolidated 2026-05-13: the previous
          standalone surface-card was folded into a popover on the
          title itself so the docs land higher on the page). Missing-
          detail badge stays below the title where users expect a
          soft heads-up; Fit + Salary chips have moved up to the page
          header row alongside Files-available. */}
      <FadeUp mode="mount" as="section" className="text-center">
        {applicationTitle && (
          <BehindApplicationHover
            fitReasoning={fit.reasoning}
            warnings={fit.warnings}
            tailoringMoves={success.what_we_did_checklist}
          >
            <h2
              className={`font-serif text-2xl font-light sm:text-3xl ${
                isLongTitle ? "leading-tight" : "leading-snug"
              }`}
            >
              {!titleHasBoth ? (
                <span className="text-text">
                  {roleArchetype || companyName}
                </span>
              ) : isLongTitle ? (
                // Stacked layout — each segment becomes a block so it
                // sits on its own centred row. " @ " drops to its own
                // line as a smaller delimiter so it reads as a
                // separator, not equal-weight content.
                <>
                  <span className="block text-text">{roleArchetype}</span>
                  <span className="block text-base text-muted-foreground/70 sm:text-lg">
                    @
                  </span>
                  <span className="block font-normal text-orange">
                    {companyName}
                  </span>
                </>
              ) : (
                // Inline layout — short titles sit on one row.
                <>
                  <span className="text-text">{roleArchetype}</span>
                  <span className="text-muted-foreground/70"> @ </span>
                  <span className="font-normal text-orange">
                    {companyName}
                  </span>
                </>
              )}
            </h2>
          </BehindApplicationHover>
        )}
        {outputMissing.length > 0 && (
          <div className="mt-3 flex justify-center">
            <MissingFieldsBadge
              fields={outputMissing}
              variant="output"
              label={`${outputMissing.length} ${outputMissing.length === 1 ? "detail" : "details"} missing`}
              popoverAlign="center"
            />
          </div>
        )}
      </FadeUp>

      {/* Sign-off block — warm framing immediately above the documents.
          User-requested placement (verbatim copy). Sized so the title
          pill above stays the dominant element; sign-off reads as a
          quieter warm aside, not a billboard. */}
      <FadeUp mode="mount" as="section" className="pt-1 text-center">
        <p className="font-serif text-lg font-light leading-snug text-text sm:text-xl">
          {firstName
            ? `Good luck with your application, ${firstName}.`
            : "Good luck with your application."}
        </p>
        <p className="mt-2 font-serif text-sm italic text-orange sm:text-base">
          Kia kaha — you&apos;ve got this.
        </p>
      </FadeUp>

      {/* Email CTA — sits directly above the previews per user request
          (2026-05-12). Single-action row; "Emailed X ago" rendered
          inline by EmailMeButton when the row's last_emailed_at is set. */}
      <FadeUp mode="mount" as="section" className="flex justify-center">
        <EmailMeButton
          applicationId={applicationId}
          lastEmailedAt={lastEmailedAt}
        />
      </FadeUp>

      {/* Side-by-side previews — promoted to land directly under the
          hero action row so documents are the first substantial thing
          the user sees. The (app) layout caps content at 800px; this
          section breaks out to ~viewport width via a 50vw negative-
          margin trick so the CV and cover letter sit next to each
          other on wide screens. Stacks vertically below 1024px. Each
          preview panel renders inside PreviewPanel, which carries its
          own zoom + download icon buttons in the card header (zoom
          opens a full-viewport modal with the same preview). The CV
          preview is a continuous scroll inside a max-height frame;
          the cover letter is one A4 page (CoverLetterPreview's own
          min-height fills the card naturally). */}
      <FadeUp mode="scroll" as="section" className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-6">
        <div className="mx-auto max-w-[1280px]">
          {/* `items-start` keeps each card at its content height so the
              cover letter doesn't stretch to match the CV's longer body. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <PreviewPanel
              eyebrow="CV preview"
              downloadHref={`/api/applications/${applicationId}/download/cv`}
              downloadLabel="Download CV"
              zoomLabel="Open CV in full screen"
              scrollMaxHeight="max-h-[900px]"
            >
              <CvPreview content={success.cv_content} />
            </PreviewPanel>
            <PreviewPanel
              eyebrow="Cover letter preview"
              downloadHref={`/api/applications/${applicationId}/download/cover_letter`}
              downloadLabel="Download cover letter"
              zoomLabel="Open cover letter in full screen"
              scrollMaxHeight="max-h-[900px]"
            >
              <CoverLetterPreview content={success.cover_letter_content} />
            </PreviewPanel>
          </div>
        </div>
      </FadeUp>

    </div>
  );
}

// ErrorRecoverySection — guided UX for the four recovery shapes:
//   - input_fixable: warn-tone banner + headline/hint, then the same
//     RetryAbandonControls form Screen 9 uses (JD editor + Retry / Abandon).
//   - transient: danger-tone banner + soft "we've been notified" hint
//     + same RetryFailedButton.
//   - non_recoverable: muted banner with no retry — only "back to
//     dashboard" + "new application".
//   - system_paused: info-tone banner with "back to dashboard" + "new
//     application" so the user can re-submit when the kill switch
//     flips back.
// Each branch shares a common 16px-icon banner shell; only the body
// rendering differs per kind.
function ErrorRecoverySection({
  applicationId,
  recovery,
  attemptNumber,
  parentJd,
  rawErrorMessage,
}: {
  applicationId: string;
  recovery: { kind: RecoveryKind; headline: string; hint: string | null };
  attemptNumber: number;
  parentJd: string;
  rawErrorMessage: string | null;
}) {
  const palette =
    recovery.kind === "input_fixable"
      ? {
          frame: "border-warn/30 bg-warn/10",
          iconShell: "border-warn/40 bg-warn/15 text-warn",
          eyebrow: "text-warn",
          eyebrowText: "Let's try again",
          Icon: PencilIcon,
        }
      : recovery.kind === "system_paused"
        ? {
            frame: "border-info/30 bg-info/10",
            iconShell: "border-info/40 bg-info/15 text-info",
            eyebrow: "text-info",
            eyebrowText: "Briefly paused",
            Icon: PauseIcon,
          }
        : recovery.kind === "non_recoverable"
          ? {
              frame: "border-border bg-dark3/60",
              iconShell:
                "border-border bg-dark2 text-muted-foreground",
              eyebrow: "text-muted-foreground",
              eyebrowText: "Heads up",
              Icon: BanIcon,
            }
          : {
              // transient — system error, soft "we've been notified" copy
              frame: "border-danger/30 bg-danger/10",
              iconShell: "border-danger/40 bg-danger/15 text-danger",
              eyebrow: "text-danger",
              eyebrowText: "Something went wrong",
              Icon: AlarmClockOffIcon,
            };

  return (
    <section className={`rounded-2xl border p-7 ${palette.frame}`}>
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className={`flex size-14 shrink-0 items-center justify-center rounded-xl border ${palette.iconShell}`}
        >
          <palette.Icon size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-bold uppercase tracking-[0.14em] ${palette.eyebrow}`}
          >
            {palette.eyebrowText}
          </p>
          <h2 className="mt-2 text-xl text-text">{recovery.headline}</h2>
          {recovery.hint && (
            <p className="mt-3 text-base leading-relaxed text-text/90">
              {recovery.hint}
            </p>
          )}

          {recovery.kind === "input_fixable" && (
            <div className="mt-6 rounded-lg border border-border bg-dark3 p-5">
              <RetryAbandonControls
                applicationId={applicationId}
                attemptNumber={attemptNumber}
                parentJd={parentJd}
              />
            </div>
          )}

          {recovery.kind === "transient" && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <RetryFailedButton
                applicationId={applicationId}
                canRetry={attemptNumber < 3}
              />
              <Link href="/application/new" className="btn-secondary">
                New application
              </Link>
            </div>
          )}

          {recovery.kind === "system_paused" && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className="btn-secondary">
                Back to dashboard
              </Link>
              <Link href="/application/new" className="btn-ghost">
                Try a new submission
              </Link>
            </div>
          )}

          {recovery.kind === "non_recoverable" && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className="btn-secondary">
                Back to dashboard
              </Link>
              <Link href="/application/new" className="btn-primary">
                New application
              </Link>
            </div>
          )}

          {/* Raw underlying message kept inside a small disclosure for
              the curious user — useful for support, never the primary
              communication. Hidden by default. */}
          {rawErrorMessage && (
            <details className="mt-6 text-sm text-muted-foreground">
              <summary className="cursor-pointer hover:text-text">
                Technical details
              </summary>
              <p className="mt-2 font-mono text-xs leading-relaxed">
                {rawErrorMessage}
              </p>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
