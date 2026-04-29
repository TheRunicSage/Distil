// ApplicationOutputSchema — single source of truth for the LLM's structured
// output. The Anthropic tool definition is generated from this schema; the
// Inngest validate-output step parses with the same schema; frontend types
// are derived via z.infer. Mirrors app_handoff_v8.md §7.5. The success
// branch's superRefine enforces ATS keyword coverage at 60%.

import { z } from "zod";

// ------ shared sub-schemas ------

const FitAssessmentSchema = z.object({
  score: z.enum(["strong", "moderate", "weak"]),
  reasoning: z.string().min(1).max(500),
  warnings: z.array(z.string().min(1).max(300)).max(8),
});

const RecentNewsItemSchema = z.object({
  headline: z.string().min(1).max(300),
  source_url: z.string().url(),
});

const ResearchSummarySchema = z.object({
  company_snapshot: z.string().min(1).max(500),
  recent_news: z.array(RecentNewsItemSchema).max(3),
  industry_context: z.string().min(1).max(300),
  is_public_sector: z.boolean(),
  company_reference_used: z.string().min(1).max(500),
  company_reference_note: z.string().max(500).optional(),
});

const JdAnalysisSchema = z.object({
  role_archetype: z.string().min(1).max(100),
  seniority: z.enum([
    "Graduate",
    "Junior",
    "Mid",
    "Senior",
    "Lead",
    "Principal",
  ]),
  must_haves: z.array(z.string().min(1).max(200)).max(20),
  nice_to_haves: z.array(z.string().min(1).max(200)).max(20),
  ats_keywords: z.array(z.string().min(1).max(80)).min(8).max(12),
});

const SalaryBandSchema = z.object({
  range: z.string().min(1).max(100),
  source_name: z.string().min(1).max(100),
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
  category: z.string().min(1).max(80),
  skills: z.array(z.string().min(1).max(80)).min(1).max(20),
});

const ProfessionalExperienceItemSchema = z.object({
  role_title: z.string().min(1).max(120),
  company: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  start_date: z.string().min(1).max(40),
  end_date: z.string().min(1).max(40),
  // v6: min bumped to 2.
  bullets: z.array(z.string().min(1).max(400)).min(2).max(8),
});

const KeyProjectSchema = z.object({
  name: z.string().min(1).max(120),
  context: z.string().min(1).max(120),
  bullets: z.array(z.string().min(1).max(400)).min(1).max(6),
  technologies: z.array(z.string().min(1).max(60)).max(15),
});

const EducationItemSchema = z.object({
  qualification: z.string().min(1).max(160),
  institution: z.string().min(1).max(160),
  location: z.string().min(1).max(120),
  dates: z.string().min(1).max(40),
  details: z.array(z.string().min(1).max(300)).max(6),
});

const LeadershipInterestItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
});

const CvContentSchema = z.object({
  contact_details: ContactDetailsSchema,
  // v6: tightened from 1..1500.
  profile: z.string().min(150).max(800),
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
  paragraphs: z.array(z.string().min(1).max(1500)).length(4),
  signoff: z.string().min(1).max(200),
});

// ------ Top-level: discriminated union on status ------

const SuccessSchema = z
  .object({
    status: z.literal("success"),
    fit_assessment: FitAssessmentSchema,
    research_summary: ResearchSummarySchema,
    jd_analysis: JdAnalysisSchema,
    salary_band: SalaryBandSchema,
    cv_content: CvContentSchema,
    cover_letter_content: CoverLetterContentSchema,
    what_we_did_checklist: z.array(z.string().min(1).max(300)).min(5).max(8),
  })
  .superRefine((data, ctx) => {
    // v6: ATS keyword coverage check. Below 50% the schema rejects;
    // 50–60% is logged as a warning by the quality scanner.
    const cvText = [
      data.cv_content.profile,
      ...data.cv_content.technical_skills.flatMap((g) => g.skills),
      ...data.cv_content.professional_experience.flatMap((r) => r.bullets),
      ...data.cv_content.key_projects.flatMap((p) => [
        ...p.bullets,
        ...p.technologies,
      ]),
    ]
      .join(" ")
      .toLowerCase();
    const keywords = data.jd_analysis.ats_keywords.map((k) => k.toLowerCase());
    const matched = keywords.filter((k) => cvText.includes(k)).length;
    const coverage = matched / keywords.length;
    if (coverage < 0.6) {
      ctx.addIssue({
        code: "custom",
        message: `Only ${matched} of ${keywords.length} ATS keywords (${Math.round(
          coverage * 100,
        )}%) appear in the CV; minimum 60% required`,
        path: ["cv_content"],
      });
    }
  });

const InsufficientInputSchema = z.object({
  status: z.literal("insufficient_input"),
  insufficient_input_reason: z.string().min(1).max(800),
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
