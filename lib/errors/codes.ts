// Single source of truth for every error code in the system. Frontend and
// backend import from here so user_message strings never drift. New codes
// only get added when the frontend actually needs to branch on them;
// everything else maps to `internal_error`. Catalogue mirrors
// app_handoff_v8.md §7.3.

export const ERROR_CODES = {
  // ----- validation (400) -----
  invalid_request: {
    http_status: 400,
    category: "validation",
    user_message:
      "The information sent does not look right. Check the form and try again.",
    client_retryable: false,
  },
  master_cv_required: {
    http_status: 400,
    category: "validation",
    user_message: "Upload a master CV before submitting an application.",
    client_retryable: false,
  },
  master_cv_too_large: {
    http_status: 400,
    category: "validation",
    user_message: "Master CV files must be 3 MB or smaller.",
    client_retryable: false,
  },
  master_cv_unsupported_type: {
    http_status: 400,
    category: "validation",
    user_message: "Master CV must be a PDF or DOCX file.",
    client_retryable: false,
  },
  master_cv_parse_failed: {
    http_status: 400,
    category: "validation",
    user_message:
      "We could not read your CV file. If it is a scanned PDF, please upload a text-based version or a DOCX.",
    client_retryable: false,
  },
  jd_too_short: {
    http_status: 400,
    category: "validation",
    user_message:
      "The job description is too short. Paste the full posting and try again.",
    client_retryable: false,
  },
  invalid_application_state: {
    http_status: 400,
    category: "validation",
    user_message: "This application cannot be changed in its current state.",
    client_retryable: false,
  },
  generation_too_large: {
    http_status: 400,
    category: "validation",
    user_message:
      "The combined size of your CV and job description is too large for a single generation. Try shortening either input.",
    client_retryable: false,
  },

  // ----- auth (401, 403) -----
  not_authenticated: {
    http_status: 401,
    category: "auth",
    user_message: "Sign in to continue.",
    client_retryable: false,
  },
  not_admin: {
    http_status: 403,
    category: "auth",
    user_message: "You do not have access to this area.",
    client_retryable: false,
  },
  not_owner: {
    http_status: 403,
    category: "auth",
    user_message: "You do not have access to this application.",
    client_retryable: false,
  },

  // ----- conflict (404, 409, 410) -----
  application_not_found: {
    http_status: 404,
    category: "conflict",
    user_message: "That application could not be found.",
    client_retryable: false,
  },
  queue_full: {
    http_status: 409,
    category: "conflict",
    user_message:
      "An application is already generating. Wait for it to finish before submitting another.",
    client_retryable: false,
  },
  idempotency_key_conflict: {
    http_status: 409,
    category: "conflict",
    user_message:
      "A different request with the same key was already received. Refresh and try again.",
    client_retryable: false,
  },
  retry_limit_reached: {
    http_status: 409,
    category: "conflict",
    user_message:
      "You have used all retry attempts for this application.",
    client_retryable: false,
  },
  email_limit_reached: {
    http_status: 409,
    category: "conflict",
    user_message:
      "You have already emailed this application 5 times. Please download instead.",
    client_retryable: false,
  },
  files_expired: {
    http_status: 410,
    category: "conflict",
    user_message:
      "These files have expired and are no longer available.",
    client_retryable: false,
  },

  // ----- system (500) -----
  internal_error: {
    http_status: 500,
    category: "system",
    user_message: "Something went wrong on our side. Please try again.",
    client_retryable: true,
  },
  database_error: {
    http_status: 500,
    category: "system",
    user_message: "We could not save your data. Please try again.",
    client_retryable: true,
  },
  rendering_failed: {
    http_status: 500,
    category: "system",
    user_message:
      "We generated the content but could not produce the documents. Please retry.",
    client_retryable: true,
  },

  // ----- external (502, 503) -----
  llm_failed: {
    http_status: 502,
    category: "external",
    user_message: "The AI service did not respond as expected. Please retry.",
    client_retryable: true,
  },
  llm_invalid_output: {
    http_status: 502,
    category: "external",
    user_message: "The AI returned an unexpected result. Please retry.",
    client_retryable: true,
  },
  storage_failed: {
    http_status: 502,
    category: "external",
    user_message: "We could not save the generated files. Please retry.",
    client_retryable: true,
  },
  email_send_failed: {
    http_status: 502,
    category: "external",
    user_message:
      "We could not send the email. Please try again or download the files instead.",
    client_retryable: true,
  },
  service_unavailable: {
    http_status: 503,
    category: "external",
    user_message:
      "A required service is temporarily unavailable. Please try again shortly.",
    client_retryable: true,
  },

  // ----- v7: kill switch and daily ceiling -----
  generation_disabled: {
    http_status: 503,
    category: "system",
    user_message:
      "New applications are temporarily paused. Please try again later.",
    client_retryable: true,
  },
  daily_cost_ceiling_reached: {
    http_status: 503,
    category: "system",
    user_message:
      "Today's usage limit has been reached. Please try again tomorrow.",
    client_retryable: false,
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export type ErrorCategory = (typeof ERROR_CODES)[ErrorCode]["category"];
