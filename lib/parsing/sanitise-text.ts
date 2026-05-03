// Strips characters that Postgres rejects in TEXT and JSONB columns.
// Real failure that drove this: PDF.js (via unpdf) emitted 87 NUL
// bytes inside the extracted text from a Canva-style CV template.
// The master_cvs.parsed_text insert returned the Postgres error
// "unsupported Unicode escape sequence", and the master-cv route
// surfaced the raw error to the user.
//
// Strategy:
//   - Strip NUL (the only character Postgres TEXT/JSONB hard-rejects)
//     and the rest of the C0 control range plus DEL. Keep TAB, LF,
//     CR — those are meaningful for layout.
//   - Collapse runs of U+FFFD (Unicode replacement char, emitted by
//     PDF.js when a glyph fails to map cleanly) to a single space.
//     Postgres handles them fine but they're visual noise the LLM
//     doesn't need.
//
// Regex source strings are written with backslash escapes so the
// file stays plain ASCII — embedding raw control bytes here would
// be a maintenance footgun (and earlier got mangled by a tool
// round-trip).

const POSTGRES_REJECT_RE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);
const REPLACEMENT_RUN_RE = new RegExp("\\uFFFD+", "g");

export function sanitiseExtractedText(text: string): string {
  return text
    .replace(POSTGRES_REJECT_RE, "")
    .replace(REPLACEMENT_RUN_RE, " ");
}
