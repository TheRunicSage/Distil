// ApplicationOutputSchema — single source of truth for the LLM's structured
// output. The Anthropic tool definition is generated from this schema; the
// Inngest validate-output step parses with the same schema; frontend types
// are derived via z.infer. Mirrors app_handoff_v8.md §7.5. The success
// branch is a plain z.object (no superRefine); ATS keyword coverage is
// reported as a non-blocking warning by lib/quality/scan.ts.
//
// 2026-04-30 length-cap audit. Caps below were originally tuned for the old
// gatekeeping posture, where the model was expected to keep every field
// short and refuse on edge cases. Under the §0 advocate posture the model
// produces longer, richer output (bridging language for skill gaps, more
// detailed fit reasoning, longer bullets that lead with action and end with
// outcome). Caps below are sized to comfortably accommodate that output
// without removing a meaningful runaway-prose guard. Rule of thumb:
//   - Internal metadata (fit_assessment, research_summary, jd_analysis,
//     salary_band): generous caps; these never render to docx so verbose
//     is fine and only matters as a runaway-prose guard.
//   - Docx-rendered fields (CV bullets, cover letter paragraphs): caps
//     sized so the renderer reliably fits the content on page; the
//     advocate posture wants room for "what was done + outcome" bullets
//     (~500 chars) and 4-paragraph cover letters at 80–100 words each.
//   - Identifier-style fields (phone, dates, salutation, signoff): caps
//     unchanged; these are tight by nature.
//
// 2026-05-01 strictness audit. Real failure: model emitted 5 paragraphs
// in cover_letter_content.paragraphs (5th was an empty string), tripping
// both the strict .length(4) array bound and the .min(1) per-string
// guard. Pulled the audit forward to every other constraint with the
// same shape (strict equality on counts, strict format validators) and
// loosened where the model's natural output overlapped the cliff:
//   - paragraphs: .length(4) → .min(3).max(5) with a preprocess that
//     filters empty/whitespace-only strings before bounds are checked.
//   - email: z.string().email() → string min(1).max(200). Prompt §7.1
//     explicitly says "copy verbatim, do not validate" — a malformed CV
//     email shouldn't drop the whole generation.
//   - source_url (recent_news + salary_band): z.string().url() →
//     string min(1).max(500). Renderer prints clickable links;
//     malformed URLs degrade gracefully on the user side.
//   - ats_keywords: min(8) → min(5). Short/vague JDs may yield 6-7
//     strong keywords; the 8-12 prompt rule stays primary.
//   - professional_experience.bullets: min(2) → min(1). Prompt §4.4
//     Lead/Principal says older roles "collapse to one line each: no
//     bullets" — schema was directly contradicting the prompt.
//   - profile: min(150) → min(100). Graduate §4.4 budget can produce
//     a tight 3-sentence profile under 150 chars.
// What stayed strict: the discriminated-union shape (status enum is
// the gatekeeper), every required field's existence (not null /
// missing), enum fields (score, confidence, seniority), and array
// caps where the prompt and schema agree the upper bound is content
// quality (e.g. paragraphs.max(5), what_we_did_checklist.max(8)).
//
// 2026-05-05 strictness audit (technical_skills empty-group pass).
// Real failure: model emitted a technical_skills group at index 5
// with an empty skills array, tripping the inner array's min(1)
// guard. Same pattern as the cover-letter paragraphs preprocess
// (2026-05-01) and research_summary nullable strings (2026-05-03):
// strict validation on shapes the model occasionally emits with
// edge-case empties. Two-layer preprocess applied:
//   - Per-group: skills filtered to drop non-string and
//     empty/whitespace-only entries before min/max bounds run.
//   - Per-array: groups with empty category or zero usable skills
//     are stripped before the outer min(1).max(8) bounds run.
// Net effect: a group with a typo'd empty entry still validates
// (entry stripped); a genuinely-orphan group is silently dropped
// rather than failing the whole generation. min(1) on the outer
// array still catches the truly-empty case (no groups at all).
// Other CV array-of-non-empty-string fields (professional_experience.
// bullets, key_projects.bullets, key_projects.technologies,
// education.details, leadership_and_interests) NOT preprocessed in
// this pass — no failure evidence yet, deferred per the targeted-
// fix-per-surfaced-failure discipline. Re-audit if any surface in
// future request_logs.metadata.zod_issues.
//
// 2026-05-03 strictness audit (research_summary metadata pass).
// Real failure: model emitted explicit null on
// research_summary.company_reference_note, tripping the schema's
// "expected string" check. System prompt §3 Phase 2 explicitly
// allows the "no specific verifiable reference was findable" path
// (set company_reference_note and proceed), so emitting null when
// no reference was anchored on is a legitimate model choice.
// Pulled the audit forward across the paired field too, since the
// model emitting null for one is liable to emit null for the
// other. New `nullableMaxString(max)` preprocess coerces null /
// undefined to "" before the string check; applied to:
//   - research_summary.company_reference_used (was min(1).max(800))
//   - research_summary.company_reference_note (was optional max(800))
// Downstream consumers (none — both fields are research metadata
// only, never read by any renderer) see a plain string with "" as
// the unset sentinel; no null-coalesce logic needed.
// Other research_summary / salary_band fields (industry_context,
// company_snapshot, salary_band.range / source_name / source_url)
// stayed strict — no null evidence yet, and the prompt expects
// these to always be filled. Re-audit if real failures land.

import { z } from "zod";

// ------ shared sub-schemas ------

const FitAssessmentSchema = z.object({
  score: z.enum(["strong", "moderate", "weak"]),
  reasoning: z.string().min(1).max(1500),
  warnings: z.array(z.string().min(1).max(600)).max(8),
});

// Relaxed URL: was z.string().url(), but model occasionally emits
// near-misses ("linkedin.com/in/foo" without scheme, "https://" without
// host, query strings with stray spaces) which are perfectly readable
// text but fail strict URL parse. Renderer just prints them as a
// clickable link; if it's malformed, the user sees the malformed link
// rather than losing the entire generation. Keep min(1) so the field
// is still required to be non-empty.
const URL_FIELD = z.string().min(1).max(500);

// Preprocess that coerces null / undefined to "" before the inner
// string check runs. Use for informational metadata fields where
// "the model couldn't find / decided not to anchor on this" is a
// legitimate runtime state — emitting null shouldn't drop the whole
// generation. Mirrors the cover-letter paragraphs preprocess shape.
// Downstream consumers see a plain string ("" for unset) and don't
// need null-coalesce logic.
function nullableMaxString(max: number) {
  return z.preprocess(
    (val) => (val === null || val === undefined ? "" : val),
    z.string().max(max),
  );
}

const RecentNewsItemSchema = z.object({
  headline: z.string().min(1).max(400),
  source_url: URL_FIELD,
});

const ResearchSummarySchema = z.object({
  company_snapshot: z.string().min(1).max(800),
  // Prompt §3 Phase 2 says "up to 3 items"; cap raised to 5 for the same
  // drift cushion as ats_keywords below — the prompt rule is the
  // primary lever, the schema is a runaway-prose guard.
  recent_news: z.array(RecentNewsItemSchema).max(5),
  industry_context: z.string().min(1).max(600),
  is_public_sector: z.boolean(),
  // company_reference_used + company_reference_note: both relaxed
  // 2026-05-03 after a real generation emitted explicit null on
  // company_reference_note. System prompt §3 Phase 2 explicitly
  // allows the "no specific verifiable reference was findable"
  // path: when the search budget completes without surfacing a
  // real project, the model is told to set company_reference_note
  // and proceed — implicit that company_reference_used can be
  // empty too. Both fields are research metadata only (no
  // downstream renderer reads them), so coercing null/undefined
  // to "" has zero blast radius. Downstream code sees a plain
  // string with "" as the unset sentinel.
  company_reference_used: nullableMaxString(800),
  company_reference_note: nullableMaxString(800),
});

const JdAnalysisSchema = z.object({
  role_archetype: z.string().min(1).max(200),
  seniority: z.enum([
    "Graduate",
    "Junior",
    "Mid",
    "Senior",
    "Lead",
    "Principal",
  ]),
  must_haves: z.array(z.string().min(1).max(400)).max(20),
  nice_to_haves: z.array(z.string().min(1).max(400)).max(20),
  // Prompt §1 Phase 1 says "Top 8 to 12 ATS keywords"; schema cap raised
  // 12 → 16 (2026-05-01) after a real generation overshot to 13. The
  // 8-to-12 rule remains the prompt's primary lever — the cushion is a
  // runaway-prose guard, not a green light to emit 16. Min lowered
  // 8 → 5 same day after the schema-vs-prompt-strictness audit: very
  // short or vague JDs may yield only 6-7 strong keywords, and we'd
  // rather accept 6 strong keywords than reject the whole generation.
  ats_keywords: z.array(z.string().min(1).max(120)).min(5).max(16),
});

const SalaryBandSchema = z.object({
  range: z.string().min(1).max(200),
  source_name: z.string().min(1).max(200),
  source_url: URL_FIELD,
  confidence: z.enum(["high", "medium", "low"]),
});

// ------ CV content ------

// Relaxed email: was z.string().email(), but §7.1 of the system prompt
// explicitly tells the model to "copy verbatim, do not validate" — so
// a master CV with a malformed or unconventional email (missing TLD,
// extra dots, "name (at) domain dot com") would fail strict parse.
// The renderer just prints the string as the contact line; downstream
// rendering does not care about RFC-5322 conformance. Keep a generous
// length cap to catch genuinely runaway prose.
const EMAIL_FIELD = z.string().min(1).max(200);

const ContactDetailsSchema = z.object({
  full_name: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  phone: z.string().min(1).max(40),
  email: EMAIL_FIELD,
  linkedin: z.string().min(1).max(200),
  work_rights: z.string().min(1).max(200),
  availability: z.string().min(1).max(120),
});

// TechnicalSkillsGroupSchema: skills array is preprocess-filtered
// to drop non-string and empty/whitespace-only entries before the
// min/max bounds run. Real failure 2026-05-05: model emitted a
// group at index 5 with an empty skills array, dropping the whole
// generation. The min(1) is still enforced post-filter — a group
// the model emits with no actual skill content is genuinely empty
// and gets caught by the outer technical_skills preprocess (which
// strips empty groups before applying the array's min/max bounds).
const TechnicalSkillsGroupSchema = z.object({
  category: z.string().min(1).max(120),
  skills: z.preprocess(
    (val) =>
      Array.isArray(val)
        ? val.filter(
            (s) => typeof s === "string" && s.trim().length > 0,
          )
        : val,
    z.array(z.string().min(1).max(160)).min(1).max(20),
  ),
});

const ProfessionalExperienceItemSchema = z.object({
  role_title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().min(1).max(120),
  start_date: z.string().min(1).max(40),
  end_date: z.string().min(1).max(40),
  // v6 had min(2). Lowered 2 → 1 (2026-05-01) — system prompt §4.4
  // Lead/Principal explicitly says "older roles (10+ years ago)
  // collapse to one line each: role, company, dates, no bullets".
  // Schema strictness was directly contradicting the prompt for that
  // tier; min(1) keeps a single bullet as the minimum (collapsed
  // roles emit a one-line summary bullet) without rejecting the
  // whole CV when the prompt and schema disagree.
  bullets: z.array(z.string().min(1).max(600)).min(1).max(8),
});

const KeyProjectSchema = z.object({
  name: z.string().min(1).max(120),
  context: z.string().min(1).max(120),
  bullets: z.array(z.string().min(1).max(600)).min(1).max(6),
  technologies: z.array(z.string().min(1).max(100)).max(15),
});

const EducationItemSchema = z.object({
  qualification: z.string().min(1).max(160),
  institution: z.string().min(1).max(160),
  location: z.string().min(1).max(120),
  dates: z.string().min(1).max(40),
  details: z.array(z.string().min(1).max(500)).max(6),
});

const LeadershipInterestItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(600),
});

const CvContentSchema = z.object({
  contact_details: ContactDetailsSchema,
  // Profile min lowered 150 → 100 (2026-05-01). Graduate §4.4 budget
  // calls for 3 short sentences and aggressive trimming; very tight
  // graduate profiles can land below 150 chars. Renderer / quality
  // scan still flag short profiles via the sentence-bound check.
  profile: z.string().min(100).max(1400),
  // technical_skills: preprocess strips groups that have no usable
  // category or no usable skills *before* the array's min/max bounds
  // are applied. Pairs with the per-group skills preprocess above:
  // a group whose skills filter to empty would otherwise fail
  // min(1) on the inner array; here we drop it entirely so the
  // CV still validates with the remaining groups. min(1) on the
  // outer array catches the genuinely-empty case (no groups at
  // all) which would correctly fail.
  technical_skills: z.preprocess(
    (val) =>
      Array.isArray(val)
        ? val.filter((g) => {
            if (typeof g !== "object" || g === null) return false;
            const group = g as { category?: unknown; skills?: unknown };
            const category =
              typeof group.category === "string"
                ? group.category.trim()
                : "";
            if (category.length === 0) return false;
            const skills = Array.isArray(group.skills)
              ? group.skills.filter(
                  (s) => typeof s === "string" && s.trim().length > 0,
                )
              : [];
            return skills.length > 0;
          })
        : val,
    z.array(TechnicalSkillsGroupSchema).min(1).max(8),
  ),
  professional_experience: z
    .array(ProfessionalExperienceItemSchema)
    .min(1)
    .max(12),
  key_projects: z.array(KeyProjectSchema).min(0).max(5),
  education: z.array(EducationItemSchema).min(1).max(6),
  leadership_and_interests: z.array(LeadershipInterestItemSchema).max(8),
  referees: z.string().min(1).max(200),
});

// ------ Cover letter content ------

const CoverLetterHeaderSchema = z.object({
  full_name: z.string().min(1).max(120),
  phone: z.string().min(1).max(40),
  email: EMAIL_FIELD,
  linkedin: z.string().min(1).max(200),
  location: z.string().min(1).max(120),
  // Accepts the literal `{{TODAY}}` placeholder; the system overrides it
  // server-side via the inject-date Inngest step.
  date: z.string().min(1).max(40),
  recipient_line: z.string().min(1).max(200),
  company_name: z.string().min(1).max(160),
  company_address: z.string().max(300).nullable(),
});

// paragraphs: was .length(4) — strict equality. Real failure 2026-05-01:
// model emitted 5 paragraphs where the 5th was an empty string,
// failing both `too_big` (length 5 > 4) and `too_small` (paragraph 4
// was ""). System prompt §5.2 still calls for exactly four paragraphs
// (Opening / Story / Company Connection / Closing), but the schema
// shouldn't drop a complete paid generation over a trailing empty
// string. Preprocess filters out empty/whitespace-only entries before
// the array bounds are checked, then accepts 3-5 paragraphs as a
// content cushion. The cover-letter renderer iterates whatever count
// it receives; the prompt rule is the primary quality lever.
const CoverLetterParagraphsSchema = z.preprocess((val) => {
  if (Array.isArray(val)) {
    return val.filter(
      (p) => typeof p === "string" && p.trim().length > 0,
    );
  }
  return val;
}, z.array(z.string().min(1).max(2000)).min(3).max(5));

const CoverLetterContentSchema = z.object({
  header: CoverLetterHeaderSchema,
  salutation: z.string().min(1).max(120),
  paragraphs: CoverLetterParagraphsSchema,
  signoff: z.string().min(1).max(200),
});

// ------ Top-level: discriminated union on status ------

// The superRefine ATS keyword coverage check (formerly hard-rejected below
// 60%) was removed 2026-04-30. Reason: it conflicted with system prompt
// §0.2 (best-light principle), which directs the model to use bridging /
// growth-oriented language for genuine skill gaps rather than keyword-
// stuffing. ATS coverage is reported as a non-blocking warning by the
// quality scanner (`lib/quality/scan.ts`), surfaced in request_logs for
// ops visibility, and never blocks delivery.
const SuccessSchema = z.object({
  status: z.literal("success"),
  fit_assessment: FitAssessmentSchema,
  research_summary: ResearchSummarySchema,
  jd_analysis: JdAnalysisSchema,
  salary_band: SalaryBandSchema,
  cv_content: CvContentSchema,
  cover_letter_content: CoverLetterContentSchema,
  what_we_did_checklist: z.array(z.string().min(1).max(500)).min(5).max(8),
});

const InsufficientInputSchema = z.object({
  status: z.literal("insufficient_input"),
  insufficient_input_reason: z.string().min(1).max(2000),
});

export const ApplicationOutputSchema = z.discriminatedUnion("status", [
  SuccessSchema,
  InsufficientInputSchema,
]);

export type ApplicationOutput = z.infer<typeof ApplicationOutputSchema>;
export type ApplicationOutputSuccess = z.infer<typeof SuccessSchema>;
export type ApplicationOutputInsufficient = z.infer<
  typeof InsufficientInputSchema
>;
