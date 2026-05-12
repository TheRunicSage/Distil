// Light-theme React preview of the tailored CV. Reads
// cv_content from llm_response_json. Mirrors the DOCX layout so the
// user can sanity-check the content before downloading; not pixel
// perfect — the DOCX is canonical. See CLAUDE.md §12 (light theme is
// scoped to the preview cards via brand `l-*` tokens).
//
// 2026-05-03: each natural break candidate (header, sections, role
// items, project items, education items) carries `data-page-section`
// so PagedPreview can pack them into A4-sized pages without splitting
// any single block across pages. The attribute is invisible / has
// no styling effect; if the preview is used outside PagedPreview
// (e.g. a future print view) the data attrs are harmless.

import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";

type Props = {
  content: ApplicationOutputSuccess["cv_content"];
};

function pipe(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" | ");
}

export function CvPreview({ content }: Props) {
  return (
    <article className="overflow-hidden rounded-lg border border-l-border bg-l-bg font-sans text-l-text leading-[1.15] shadow-card">
      {/* Brand band — full-width orange stripe at the top of the
          paper. Gives the preview a Distil signature without
          interfering with ATS-relevant content (the DOCX is the
          canonical artefact; the preview is allowed to read more
          on-brand than the parsed download). */}
      <div className="h-1.5 bg-orange" aria-hidden />
      <div className="p-14">
        <header data-page-section>
          <h1 className="text-2xl font-bold leading-tight">
            {content.contact_details.full_name}
          </h1>
          <p className="mt-2 border-b-2 border-orange/40 pb-2 text-xs text-l-mid">
            {pipe([
              content.contact_details.location,
              content.contact_details.email,
              content.contact_details.phone,
              content.contact_details.linkedin,
            ])}
            {content.contact_details.work_rights || content.contact_details.availability ? (
              <>
                <br />
                {pipe([
                  content.contact_details.work_rights
                    ? `Work Rights: ${content.contact_details.work_rights}`
                    : null,
                  content.contact_details.availability
                    ? `Availability: ${content.contact_details.availability}`
                    : null,
                ])}
              </>
            ) : null}
          </p>
        </header>

      <Section title="Profile">
        <p className="text-sm">{content.profile}</p>
      </Section>

      {content.technical_skills.length > 0 && (
        // Display heading renamed "Technical Skills" → "Skills"
        // (2026-05-13). Schema field name `technical_skills` is the
        // internal key only, kept as-is. See lib/docx/render-cv.ts
        // for the rationale.
        <Section title="Skills">
          <ul className="space-y-1.5 text-sm">
            {content.technical_skills.map((g, i) => (
              <li key={i}>
                <strong className="font-semibold">{g.category}:</strong>{" "}
                {g.skills.join(", ")}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Professional Experience">
        <div className="space-y-5">
          {content.professional_experience.map((role, i) => (
            <div key={i} data-page-section>
              <p className="font-semibold">
                {role.role_title}, {role.company}
              </p>
              <p className="text-xs text-l-mid">
                {pipe([role.location, `${role.start_date} to ${role.end_date}`])}
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                {role.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {content.key_projects.length > 0 && (
        <Section title="Key Projects">
          <div className="space-y-5">
            {content.key_projects.map((p, i) => (
              <div key={i} data-page-section>
                <p>
                  <strong className="font-semibold">{p.name}</strong>
                  {" | "}
                  <em className="italic text-l-mid">{p.context}</em>
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                  {p.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
                {p.technologies.length > 0 && (
                  <p className="mt-1.5 text-xs text-l-mid">
                    Technologies: {p.technologies.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Education">
        <div className="space-y-4">
          {content.education.map((e, i) => (
            <div key={i} data-page-section>
              <p className="font-semibold">
                {e.qualification}, {e.institution}
              </p>
              <p className="text-xs text-l-mid">
                {pipe([e.location, e.dates])}
              </p>
              {e.details.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                  {e.details.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      {content.leadership_and_interests.length > 0 && (
        <Section title="Leadership and Interests">
          <ul className="space-y-1.5 text-sm">
            {content.leadership_and_interests.map((item, i) => (
              <li key={i}>
                <strong className="font-semibold">{item.title}:</strong>{" "}
                {item.description}
              </li>
            ))}
          </ul>
        </Section>
      )}

        <Section title="Referees">
          <p className="text-sm">{content.referees}</p>
        </Section>
      </div>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6" data-page-section>
      <h2 className="border-b-2 border-orange/30 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-orange">
        {title}
      </h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
