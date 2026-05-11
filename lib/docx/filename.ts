// Shared filename builder for tailored CV / cover letter DOCX files.
// Used by both the /api/applications/[id]/download route (sets the
// Content-Disposition filename on signed Supabase Storage URLs) and the
// email send helper (sets the attachment filename for Resend).
//
// Format per app_handoff §5.5:
//   {lastname}_CV_{company_short}_{yyyymmdd}.docx
//   {lastname}_CoverLetter_{company_short}_{yyyymmdd}.docx
//
// `company_short` is the LLM-emitted company_name slugified to
// `[A-Za-z0-9_]` and capped at 24 chars (Decision Log [11]).

import type {
  ApplicationOutput,
  ApplicationOutputSuccess,
} from "@/lib/llm/output-schema";

export type DocKind = "cv" | "cover_letter";

export function safeFilenameSegment(s: string, max = 24): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, max) || "Application"
  );
}

export function dateStamp(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function buildFilename(
  kind: DocKind,
  output: ApplicationOutputSuccess | null,
  fallbackDate: Date,
): string {
  const last =
    output?.cv_content.contact_details.full_name?.split(/\s+/).pop() ??
    "Candidate";
  const company =
    output?.cover_letter_content.header.company_name ?? "Application";
  const stamp = dateStamp(fallbackDate);
  const label = kind === "cv" ? "CV" : "CoverLetter";
  return `${safeFilenameSegment(last)}_${label}_${safeFilenameSegment(
    company,
  )}_${stamp}.docx`;
}

// Convenience: cast a possibly-null `llm_response_json` to the success
// branch for filename purposes. Used by both call sites.
export function asSuccessOutput(
  json: unknown,
): ApplicationOutputSuccess | null {
  const cast = json as ApplicationOutput | null;
  if (cast?.status === "success") return cast;
  return null;
}
