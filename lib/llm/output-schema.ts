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

import { z } from "zod";

// ------ shared sub-schemas ------

const FitAssessmentSchema = z.object({
  score: z.enum(["strong", "moderate", "weak"]),
  reasoning: z.string().min(1).max(1500),
  warnings: z.array(z.string().min(1).max(600)).max(8),
});

const RecentNewsItemSchema = z.object({
  headline: z.string().min(1).max(400),
  source_url: z.string().url(),
});

const ResearchSummarySchema = z.object({
  company_snapshot: z.string().min(1).max(800),
  // Prompt §3 Phase 2 says "up to 3 items"; cap raised to 5 for the same
  // drift cushion as ats_keywords below — the prompt rule is the
  // primary lever, the schema is a runaway-prose guard.
  recent_news: z.array(RecentNewsItemSchema).max(5),
  industry_context: z.string().min(1).max(600),
  is_public_sector: z.boolean(),
  company_reference_used: z.string().min(1).max(800),
  company_reference_note: z.string().max(800).optional(),
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
  // runaway-prose guard, not a green light to emit 16.
  ats_keywords: z.array(z.string().min(1).max(120)).min(8).max(16),
});

const SalaryBandSchema = z.object({
  range: z.string().min(1).max(200),
  source_name: z.string().min(1).max(200),
  source_url: z.string().url(),
  confidence: z.enum(["high", "medium", "low"]),
});

// ------ CV content ------

const ContactDetailsSchema = z.object({
  full_name: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  phone: z.string().min(1).max(40),
  email: z.string().email(),
  linkedin: z.string().min(1).max(200),
  work_rights: z.string().min(1).max(200),
  availability: z.string().min(1).max(120),
});

const TechnicalSkillsGroupSchema = z.object({
  category: z.string().min(1).max(120),
  skills: z.array(z.string().min(1).max(160)).min(1).max(20),
});

const ProfessionalExperienceItemSchema = z.object({
  role_title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().min(1).max(120),
  start_date: z.string().min(1).max(40),
  end_date: z.string().min(1).max(40),
  // v6: min bumped to 2.
  bullets: z.array(z.string().min(1).max(600)).min(2).max(8),
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
  profile: z.string().min(150).max(1400),
  technical_skills: z.array(TechnicalSkillsGroupSchema).min(1).max(8),
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
  email: z.string().email(),
  linkedin: z.string().min(1).max(200),
  location: z.string().min(1).max(120),
  // Accepts the literal `{{TODAY}}` placeholder; the system overrides it
  // server-side via the inject-date Inngest step.
  date: z.string().min(1).max(40),
  recipient_line: z.string().min(1).max(200),
  company_name: z.string().min(1).max(160),
  company_address: z.string().max(300).nullable(),
});

const CoverLetterContentSchema = z.object({
  header: CoverLetterHeaderSchema,
  salutation: z.string().min(1).max(120),
  paragraphs: z.array(z.string().min(1).max(2000)).length(4),
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
