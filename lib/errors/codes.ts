// Single source of truth for every error code in the system. Frontend and
// backend import from here so user_message strings never drift. New codes
// only get added when the frontend actually needs to branch on them;
// everything else maps to `internal_error`. Catalogue mirrors
// app_handoff_v8.md §7.3.
//
// 2026-05-09: each code carries a recovery descriptor for the application
// detail page's error-state UX. recovery_kind drives which branch renders;
// recovery_headline is the H1 on the recovery surface; recovery_hint is the
// one-sentence "what to try" line shown to the user. See CLAUDE.md
// Decision Log [14] (audit pass — guided error recovery).
//   - "input_fixable": user can edit JD / re-upload CV and retry inline
//   - "transient": system-side, retry-as-is. Sentry alerts the team.
//   - "non_recoverable": dead-end. User goes back to dashboard.
//   - "system_paused": platform paused (kill switch). Try later.
//   - "no_recovery": never lands on the detail page (auth, validation
//     at submit time, etc.). Sentinel for codes that pre-empt creation.
// Notes:
//   - "internal_error" is the fallback when no error_code lands on the
//     latest request_logs row for the application; treated as transient.
//   - "cancelled" status is handled separately on the page (not a code).

export type RecoveryKind =
  | "input_fixable"
  | "transient"
  | "non_recoverable"
  | "system_paused"
  | "no_recovery";

export const ERROR_CODES = {
  // ----- validation (400) -----
  invalid_request: {
    http_status: 400,
    category: "validation",
    user_message:
      "The information sent does not look right. Check the form and try again.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Something in the form looked off",
    recovery_hint: null,
  },
  master_cv_required: {
    http_status: 400,
    category: "validation",
    user_message: "Upload a master CV before submitting an application.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Upload a master CV first",
    recovery_hint: null,
  },
  master_cv_too_large: {
    http_status: 400,
    category: "validation",
    user_message: "Master CV files must be 3 MB or smaller.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Your CV file was too large",
    recovery_hint: null,
  },
  master_cv_unsupported_type: {
    http_status: 400,
    category: "validation",
    user_message: "Master CV must be a PDF or DOCX file.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "We can only read PDF or DOCX",
    recovery_hint: null,
  },
  master_cv_parse_failed: {
    http_status: 400,
    category: "validation",
    user_message:
      "We could not read your CV file. If it is a scanned PDF, please upload a text-based version or a DOCX.",
    client_retryable: false,
    recovery_kind: "input_fixable",
    recovery_headline: "We couldn't read your CV file",
    recovery_hint:
      "Re-upload as a text-based PDF or DOCX. Scanned PDFs (image-only) won't work — export a text version from the original document if you can.",
  },
  jd_too_short: {
    http_status: 400,
    category: "validation",
    user_message:
      "The job description is too short. Paste the full posting and try again.",
    client_retryable: false,
    recovery_kind: "input_fixable",
    recovery_headline: "The job description was too short",
    recovery_hint:
      "Paste the full posting — title, responsibilities, requirements, the whole thing. The more context, the sharper the tailoring.",
  },
  invalid_application_state: {
    http_status: 400,
    category: "validation",
    user_message: "This application cannot be changed in its current state.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "This application can't be changed right now",
    recovery_hint: null,
  },
  generation_too_large: {
    http_status: 400,
    category: "validation",
    user_message:
      "The combined size of your CV and job description is too large for a single generation. Try shortening either input.",
    client_retryable: false,
    recovery_kind: "input_fixable",
    recovery_headline: "Your inputs were too large for one run",
    recovery_hint:
      "Try shortening the job description (paste only the role-relevant sections) or trimming older roles from your master CV.",
  },

  // ----- auth (401, 403) -----
  not_authenticated: {
    http_status: 401,
    category: "auth",
    user_message: "Sign in to continue.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Sign in to continue",
    recovery_hint: null,
  },
  not_admin: {
    http_status: 403,
    category: "auth",
    user_message: "You do not have access to this area.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Access denied",
    recovery_hint: null,
  },
  not_owner: {
    http_status: 403,
    category: "auth",
    user_message: "You do not have access to this application.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Access denied",
    recovery_hint: null,
  },

  // ----- conflict (404, 409, 410) -----
  application_not_found: {
    http_status: 404,
    category: "conflict",
    user_message: "That application could not be found.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Application not found",
    recovery_hint: null,
  },
  queue_full: {
    http_status: 409,
    category: "conflict",
    user_message:
      "An application is already generating. Wait for it to finish before submitting another.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Queue is full",
    recovery_hint: null,
  },
  idempotency_key_conflict: {
    http_status: 409,
    category: "conflict",
    user_message:
      "A different request with the same key was already received. Refresh and try again.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Duplicate submission",
    recovery_hint: null,
  },
  retry_limit_reached: {
    http_status: 409,
    category: "conflict",
    user_message:
      "You have used all retry attempts for this application.",
    client_retryable: false,
    recovery_kind: "non_recoverable",
    recovery_headline: "Three attempts used",
    recovery_hint:
      "This application has reached the retry cap. You can start a new application from scratch — that's a clean attempt-1 with the same master CV.",
  },
  email_limit_reached: {
    http_status: 409,
    category: "conflict",
    user_message:
      "You have already emailed this application 5 times. Please download instead.",
    client_retryable: false,
    recovery_kind: "no_recovery",
    recovery_headline: "Email limit reached",
    recovery_hint: null,
  },
  files_expired: {
    http_status: 410,
    category: "conflict",
    user_message:
      "These files have expired and are no longer available.",
    client_retryable: false,
    recovery_kind: "non_recoverable",
    recovery_headline: "Files expired",
    recovery_hint:
      "Generated files are kept for 60 days. Start a new application if you'd like a fresh tailored set.",
  },

  // ----- system (500) -----
  internal_error: {
    http_status: 500,
    category: "system",
    user_message: "Something went wrong on our side. Please try again.",
    client_retryable: true,
    recovery_kind: "transient",
    recovery_headline: "Something went wrong on our end",
    recovery_hint:
      "Our team has been alerted automatically and we're looking into it. Most issues clear up in a moment — a quick retry usually does the trick.",
  },
  database_error: {
    http_status: 500,
    category: "system",
    user_message: "We could not save your data. Please try again.",
    client_retryable: true,
    recovery_kind: "transient",
    recovery_headline: "We had trouble saving",
    recovery_hint:
      "Our team has been alerted automatically and we're looking into it. Retry and it should go through.",
  },
  rendering_failed: {
    http_status: 500,
    category: "system",
    user_message:
      "We generated the content but could not produce the documents. Please retry.",
    client_retryable: true,
    recovery_kind: "transient",
    recovery_headline: "We couldn't produce the documents",
    recovery_hint:
      "The content was generated but document rendering failed. Our team has been alerted automatically — retry should get it out the door.",
  },

  // ----- external (502, 503) -----
  llm_failed: {
    http_status: 502,
    category: "external",
    user_message: "The AI service did not respond as expected. Please retry.",
    client_retryable: true,
    recovery_kind: "transient",
    recovery_headline: "The AI service had a hiccup",
    recovery_hint:
      "This is on our end — the AI provider didn't respond properly. Our team has been alerted automatically. Retry should land cleanly.",
  },
  llm_invalid_output: {
    http_status: 502,
    category: "external",
    user_message: "The AI returned an unexpected result. Please retry.",
    client_retryable: true,
    recovery_kind: "input_fixable",
    recovery_headline: "The AI didn't produce a valid result",
    recovery_hint:
      "Sometimes the AI gets confused on a particular job description and outputs something the renderer can't read. Adjusting the JD (paste a fuller version, or a cleaner cut without bullet symbols) often gives the model clearer signal.",
  },
  storage_failed: {
    http_status: 502,
    category: "external",
    user_message: "We could not save the generated files. Please retry.",
    client_retryable: true,
    recovery_kind: "transient",
    recovery_headline: "We couldn't save your files",
    recovery_hint:
      "Storage glitched on our side. Our team has been alerted automatically. A retry should push it through.",
  },
  email_send_failed: {
    http_status: 502,
    category: "external",
    user_message:
      "We could not send the email. Please try again or download the files instead.",
    client_retryable: true,
    recovery_kind: "no_recovery",
    recovery_headline: "Email send failed",
    recovery_hint: null,
  },
  service_unavailable: {
    http_status: 503,
    category: "external",
    user_message:
      "A required service is temporarily unavailable. Please try again shortly.",
    client_retryable: true,
    recovery_kind: "transient",
    recovery_headline: "A service is briefly unavailable",
    recovery_hint:
      "An upstream service is down for a moment. Our team has been alerted automatically. Try again in a minute or two.",
  },

  // ----- v7: kill switch and daily ceiling -----
  generation_disabled: {
    http_status: 503,
    category: "system",
    user_message:
      "New applications are temporarily paused. Please try again later.",
    client_retryable: true,
    recovery_kind: "system_paused",
    recovery_headline: "We've paused new generations briefly",
    recovery_hint:
      "We're checking on something behind the scenes. Try again in a few minutes — it'll come right back online.",
  },
  daily_cost_ceiling_reached: {
    http_status: 503,
    category: "system",
    user_message:
      "Today's usage limit has been reached. Please try again tomorrow.",
    client_retryable: false,
    recovery_kind: "non_recoverable",
    recovery_headline: "Today's usage limit was reached",
    recovery_hint:
      "We cap daily usage to keep things running predictably for everyone. Try again tomorrow — the limit resets at midnight.",
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export type ErrorCategory = (typeof ERROR_CODES)[ErrorCode]["category"];
