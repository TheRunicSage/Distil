// Server-side post-processor that strips AI-tells from the rendered
// portion of the LLM output. The system prompt §2.2 already bans em
// (U+2014) and en (U+2013) dashes, but the model regularly emits them
// anyway — they are the single most reliable statistical signal that
// text was machine-generated, and a recruiter scanning a cover letter
// will pick up on them within seconds. Defensive belt-and-braces:
// strip any that survived the prompt before the docx renderer sees
// them.
//
// Replacement policy:
//   - Numeric / date ranges with an em or en dash → " to "
//     ("2018 – 2021" → "2018 to 2021"; matches the §2.2 spec rule)
//   - Em dash (—) used as a punctuation pause → ", "
//   - En dash (–) elsewhere (titles, name suffixes) → "-" (regular
//     hyphen — safest fallback that doesn't change meaning)
//
// Internal metadata fields (fit_assessment, research_summary,
// jd_analysis, salary_band, what_we_did_checklist) never render to
// docx, so we leave them alone. Only fields that the docx renderer
// inks are sanitised here.

import type { ApplicationOutputSuccess } from "./output-schema";

// Unicode dash/hyphen characters the model has been observed to emit:
//   U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash,
//   U+2013 en dash, U+2014 em dash, U+2015 horizontal bar,
//   U+2212 minus sign. Plus ASCII fake em-dashes "--" and "---" that
//   some models emit when nudged away from the Unicode form.
//
// U+002D hyphen-minus (the regular keyboard hyphen) is intentionally
// NOT stripped — it's the correct character for compound words like
// "full-stack" or "well-researched". Anything else gets normalised.
function stripDashes(text: string): string {
  return text
    // Numeric ranges first (handles all Unicode dashes and ASCII --).
    // ‐-― covers hyphen, non-breaking hyphen, figure dash,
    // en dash, em dash, horizontal bar. − is the math minus sign.
    .replace(/(\d)\s*(?:[‐-―−]|--+)\s*(\d)/g, "$1 to $2")
    // Em-dash family used as a punctuation pause → comma + space.
    // U+2014 em, U+2015 horizontal bar, U+2212 minus, plus the ASCII
    // fake "---" and "--" sequences models occasionally fall back on.
    .replace(/\s*(?:[—―−]|---|--)\s*/g, ", ")
    // Remaining U+2010-U+2013 (hyphen, non-breaking hyphen, figure
    // dash, en dash) collapse to a regular hyphen-minus so compound
    // words still read correctly. U+002D is left untouched.
    .replace(/[‐-–]/g, "-");
}

// Null-safe wrapper for the contact-detail fields that became nullable
// in the 2026-05-11 §7.1 rewrite (phone, email, linkedin, work_rights,
// availability on both CV and cover letter). Returns null untouched so
// the renderer's pipe filter still drops absent fields cleanly.
function stripDashesOpt(text: string | null): string | null {
  return text === null ? null : stripDashes(text);
}

export function sanitiseOutput(
  output: ApplicationOutputSuccess,
): ApplicationOutputSuccess {
  const cv = output.cv_content;
  const cl = output.cover_letter_content;

  return {
    ...output,
    cv_content: {
      ...cv,
      contact_details: {
        ...cv.contact_details,
        full_name: stripDashes(cv.contact_details.full_name),
        location: stripDashes(cv.contact_details.location),
        phone: stripDashesOpt(cv.contact_details.phone),
        linkedin: stripDashesOpt(cv.contact_details.linkedin),
        work_rights: stripDashesOpt(cv.contact_details.work_rights),
        availability: stripDashesOpt(cv.contact_details.availability),
        // email never contains dashes worth worrying about; leave as-is.
      },
      profile: stripDashes(cv.profile),
      technical_skills: cv.technical_skills.map((g) => ({
        category: stripDashes(g.category),
        skills: g.skills.map(stripDashes),
      })),
      professional_experience: cv.professional_experience.map((r) => ({
        ...r,
        role_title: stripDashes(r.role_title),
        company: stripDashes(r.company),
        location: stripDashes(r.location),
        start_date: r.start_date === null ? null : stripDashes(r.start_date),
        end_date: r.end_date === null ? null : stripDashes(r.end_date),
        bullets: r.bullets.map(stripDashes),
      })),
      key_projects: cv.key_projects.map((p) => ({
        ...p,
        name: stripDashes(p.name),
        context: stripDashes(p.context),
        bullets: p.bullets.map(stripDashes),
        technologies: p.technologies.map(stripDashes),
      })),
      education: cv.education.map((e) => ({
        ...e,
        qualification: stripDashes(e.qualification),
        institution: stripDashes(e.institution),
        location: stripDashes(e.location),
        dates: stripDashes(e.dates),
        details: e.details.map(stripDashes),
      })),
      leadership_and_interests: cv.leadership_and_interests.map((i) => ({
        title: stripDashes(i.title),
        description: stripDashes(i.description),
      })),
      referees: stripDashes(cv.referees),
    },
    cover_letter_content: {
      ...cl,
      header: {
        ...cl.header,
        full_name: stripDashes(cl.header.full_name),
        phone: stripDashesOpt(cl.header.phone),
        linkedin: stripDashesOpt(cl.header.linkedin),
        location: stripDashes(cl.header.location),
        // date already replaced server-side by injectDate; no dashes.
        recipient_line: stripDashes(cl.header.recipient_line),
        company_name: stripDashes(cl.header.company_name),
        company_address: cl.header.company_address
          ? stripDashes(cl.header.company_address)
          : cl.header.company_address,
      },
      salutation: stripDashes(cl.salutation),
      paragraphs: cl.paragraphs.map(stripDashes),
      signoff: stripDashes(cl.signoff),
    },
  };
}
