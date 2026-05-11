// Defensive normalisation for the cover letter salutation. The system
// prompt §5.2 requires every salutation to end with a comma ("Dear Hiring
// Manager,", "Dear Joel,", "Kia ora,"); §10 self-check item 34 enforces
// it at output time. This helper is the renderer-side safety net so a
// missing comma never reaches the docx or the preview.
//
// Rules:
//   - Whitespace-trim first.
//   - If the trimmed string already ends with one of `, . ! :`, leave it
//     alone (some formal markets prefer a colon).
//   - Otherwise append a comma.
//
// Pure function, no allocations beyond the result string. Imported by
// both lib/docx/render-cover-letter.ts (server) and
// components/application/CoverLetterPreview.tsx (client) so the rule
// lives in one place.

const TRAILING_PUNCTUATION = new Set([",", ".", "!", ":"]);

export function normaliseSalutation(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  const lastChar = trimmed[trimmed.length - 1];
  if (TRAILING_PUNCTUATION.has(lastChar)) return trimmed;
  return trimmed + ",";
}
