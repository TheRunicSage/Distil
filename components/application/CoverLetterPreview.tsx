// Light-theme React preview of the tailored cover letter. Reads
// cover_letter_content from llm_response_json. Renders the date
// already-resolved (server-side inject-date step has run by the time
// the document is in success state).
//
// 2026-05-09: brand treatment mirrored from CvPreview — orange band
// at the top, orange-tinted rule under the sender pipe-line, article
// wrapped in `overflow-hidden` so the band sits flush in the rounded
// corner. Padding moved off the article onto an inner wrapper so the
// band is full-bleed against the paper edge.

import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";

type Props = {
  content: ApplicationOutputSuccess["cover_letter_content"];
};

function pipe(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" | ");
}

export function CoverLetterPreview({ content }: Props) {
  return (
    <article
      className="overflow-hidden rounded-lg border border-l-border bg-l-bg font-sans text-l-text leading-[1.15] shadow-card"
      // Cover letters are by spec exactly one A4 page. Without a
      // min-height the article ends where its (short) content ends,
      // producing a "less than a page" visual under the A4-sized
      // PagedPreview frame. min-h matches the unscaled A4 height
      // (1123px = 297mm at 96 DPI) so the article fills exactly
      // one page regardless of content length.
      style={{ minHeight: "1123px" }}
    >
      {/* Brand band — full-width orange stripe at the top of the
          paper. Mirrors CvPreview so the two previews share a
          visual signature. */}
      <div className="h-1.5 bg-orange" aria-hidden />
      <div className="p-14">
        <header data-page-section>
          {/* Name heading mirrors CvPreview's h1 — text-2xl font-bold —
              so the two previews share the same name-treatment scale.
              The DOCX renderer's nameHeading() already emits this name
              at 15pt for both documents (Decision Log [9] 2026-05-01);
              the preview is just catching up to the DOCX. */}
          <h1 className="text-2xl font-bold leading-tight">
            {content.header.full_name}
          </h1>
          <p className="mt-2 border-b-2 border-orange/40 pb-2 text-xs text-l-mid">
            {pipe([
              content.header.phone,
              content.header.email,
              content.header.linkedin,
              content.header.location,
            ])}
          </p>
        </header>

        <p className="mt-6 text-sm">{content.header.date}</p>

        <div className="mt-6 text-sm">
          <p>{content.header.recipient_line}</p>
          {content.header.company_name && <p>{content.header.company_name}</p>}
          {content.header.company_address && (
            <p>{content.header.company_address}</p>
          )}
        </div>

        <p className="mt-6 text-sm" data-page-section>
          {content.salutation}
        </p>

        <div className="mt-4 space-y-4 text-sm">
          {content.paragraphs.map((p, i) => (
            <p key={i} data-page-section>
              {p}
            </p>
          ))}
        </div>

        <div className="mt-6 text-sm" data-page-section>
          {content.signoff.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </article>
  );
}
