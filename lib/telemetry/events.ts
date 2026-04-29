// Telemetry event catalogue. The TelemetryEventMap shape enforces correct
// properties per event name at the call site. Mirrors app_handoff_v8.md
// §7.4. PII rules: never CV/JD content, emails, phones, names, free-text;
// only ids, durations, sizes, enums, counts.

export type TelemetryEventMap = {
  // ----- auth -----
  "auth.signin.attempted": { method: "password" };
  "auth.signin.succeeded": { method: "password"; duration_ms: number };
  "auth.signin.failed": { method: "password"; error_code: string };
  "auth.signout": Record<string, never>;

  // ----- master cv -----
  "master_cv.upload.started": {
    file_size_bytes: number;
    mime_type: string;
  };
  "master_cv.upload.succeeded": {
    file_size_bytes: number;
    mime_type: string;
    duration_ms: number;
  };
  "master_cv.upload.failed": { error_code: string };

  // ----- application input -----
  "jd_input.focused": Record<string, never>;
  "jd_input.first_edit": Record<string, never>;
  "jd_input.short_warning_shown": { length_chars: number };
  "notes_input.first_edit": Record<string, never>;

  // ----- application submission -----
  "application.submit.attempted": {
    has_notes: boolean;
    jd_length_chars: number;
  };
  "application.submit.succeeded": {
    application_id: string;
    queue_position: number;
  };
  "application.submit.failed": { error_code: string };

  // ----- generation lifecycle (mirror of generation_events for analytics) -----
  "generation.started": { application_id: string };
  "generation.llm_completed": {
    application_id: string;
    duration_ms: number;
  };
  "generation.finalized": {
    application_id: string;
    outcome: "success" | "insufficient_input" | "error";
    duration_ms: number;
  };

  // ----- retry / abandon -----
  "application.retry.attempted": {
    parent_application_id: string;
    attempt_number: 2 | 3;
  };
  "application.retry.succeeded": {
    application_id: string;
    parent_application_id: string;
  };
  "application.abandon": {
    application_id: string;
    attempt_number: 1 | 2 | 3;
  };

  // ----- downloads -----
  "download.requested": {
    application_id: string;
    kind: "cv" | "cover_letter";
  };
  "download.failed": {
    application_id: string;
    kind: "cv" | "cover_letter";
    error_code: string;
  };

  // ----- email (v6) -----
  "email.send.attempted": { application_id: string };
  "email.send.succeeded": { application_id: string; duration_ms: number };
  "email.send.failed": { application_id: string; error_code: string };

  // ----- preview (v6) -----
  "preview.viewed": {
    application_id: string;
    kind: "cv" | "cover_letter";
  };

  // ----- page views -----
  "page.viewed": { path: string };
};

export type TelemetryEventName = keyof TelemetryEventMap;
