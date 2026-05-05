// Light-theme React preview of the tailored cover letter. Reads
// cover_letter_content from llm_response_json. Renders the date
// already-resolved (server-side inject-date step has run by the time
// the document is in success state).

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
      className="rounded-lg border border-l-border bg-l-bg p-14 font-sans text-l-text leading-[1.15] shadow-card"
      // Cover letters are by spec exactly one A4 page. Without a
      // min-height the article ends where its (short) content ends,
      // producing a "less than a page" visual under the A4-sized
      // PagedPreview frame. min-h matches the unscaled A4 height
      // (1123px = 297mm at 96 DPI) so the article fills exactly
      // one page regardless of content length.
      style={{ minHeight: "1123px" }}
    >
      <header data-page-section>
        <p className="font-semibold">{content.header.full_name}</p>
        <p className="text-xs text-l-mid">
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
    </article>
  );
}
