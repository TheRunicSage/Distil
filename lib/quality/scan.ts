// Output quality scanner. Pure function: takes the validated LLM output
// (success branch only) plus the region, returns an array of warnings.
// Caller writes the warnings to request_logs.metadata. Never throws,
// never blocks the run. Decision Log [7] Option B (pure return) and
// Option C (banned phrases inline with drift comment).
//
// IMPORTANT: the BANNED_PHRASES list below mirrors prompts/system-prompt-v2.md
// §2.2. When you edit the prompt, edit this list too — they cannot share a
// module because the prompt is markdown loaded by the LLM at runtime.

import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";

export type QualityWarningKind =
  | "em_dash_present"
  | "en_dash_present"
  | "banned_phrase"
  | "missing_kia_ora_salutation"
  | "ats_keyword_coverage_low"
  | "profile_sentence_count_off";

export type QualityWarning = {
  kind: QualityWarningKind;
  detail: string;
};

// Mirror of system-prompt-v2.md §2.2 phrase blacklist. Edit both when
// the prompt changes.
const BANNED_PHRASES: readonly string[] = [
  // openers
  "i am writing to express my interest",
  "i am excited to apply",
  "i am thrilled to",
  "i am deeply impressed by",
  "passionate about",
  "leveraging my skills",
  "synergistic team player",
  "commitment to innovation",
  "industry-leading",
  "cutting-edge",
  "world-class",
  "best-in-class",
  "detail-oriented professional",
  "proven track record",
  "in today's fast-paced world",
  // verbs (vague)
  "leverage",
  "delve",
  "unlock",
  "elevate",
  "harness",
  // nouns (vague)
  "tapestry",
  "synergy",
  // structural
  "it's worth noting that",
  "it is worth noting that",
  "it's important to note that",
  "it is important to note that",
];

// Sentence count by seniority — see system prompt §4.2.
// (min, max) inclusive. Used for the profile only.
const PROFILE_SENTENCE_BOUNDS: Record<string, [number, number]> = {
  Graduate: [3, 4],
  Junior: [3, 4],
  Mid: [3, 3],
  Senior: [2, 3],
  Lead: [2, 3],
  Principal: [2, 3],
};

export function runQualityScan(
  output: ApplicationOutputSuccess,
  region: string,
): QualityWarning[] {
  const warnings: QualityWarning[] = [];

  const cvCorpus = collectCvText(output);
  const letterCorpus = collectLetterText(output);
  const allText = `${cvCorpus}\n${letterCorpus}`;
  const lowered = allText.toLowerCase();

  if (allText.includes("—")) {
    warnings.push({ kind: "em_dash_present", detail: "U+2014 found" });
  }
  if (allText.includes("–")) {
    warnings.push({ kind: "en_dash_present", detail: "U+2013 found" });
  }

  for (const phrase of BANNED_PHRASES) {
    if (lowered.includes(phrase)) {
      warnings.push({ kind: "banned_phrase", detail: phrase });
    }
  }

  if (region === "NZ") {
    const salutation = output.cover_letter_content.salutation
      .trim()
      .toLowerCase();
    if (!salutation.startsWith("kia ora")) {
      warnings.push({
        kind: "missing_kia_ora_salutation",
        detail: `salutation was "${output.cover_letter_content.salutation}"`,
      });
    }
  }

  // ATS coverage warning. The hard-reject 60% rule was removed from the
  // schema (2026-04-30) to align with system prompt §0.2 — a weak-fit
  // candidate's CV will legitimately have lower direct keyword match
  // when the model bridges gaps with growth-oriented language rather
  // than keyword-stuffing. We still surface low coverage as a warning
  // in request_logs for ops visibility; we never block delivery on it.
  const coverage = computeAtsCoverage(output);
  if (coverage < 0.6) {
    warnings.push({
      kind: "ats_keyword_coverage_low",
      detail: `ATS keyword coverage ${Math.round(coverage * 100)}% (target 60%+)`,
    });
  }

  const seniority = output.jd_analysis.seniority;
  const bounds = PROFILE_SENTENCE_BOUNDS[seniority];
  if (bounds) {
    const sentences = countSentences(output.cv_content.profile);
    if (sentences < bounds[0] || sentences > bounds[1]) {
      warnings.push({
        kind: "profile_sentence_count_off",
        detail: `profile has ${sentences} sentences; expected ${bounds[0]}–${bounds[1]} for ${seniority}`,
      });
    }
  }

  return warnings;
}

function collectCvText(output: ApplicationOutputSuccess): string {
  const cv = output.cv_content;
  return [
    cv.profile,
    ...cv.technical_skills.flatMap((g) => [g.category, ...g.skills]),
    ...cv.professional_experience.flatMap((r) => [
      r.role_title,
      r.company,
      ...r.bullets,
    ]),
    ...cv.key_projects.flatMap((p) => [
      p.name,
      p.context,
      ...p.bullets,
      ...p.technologies,
    ]),
    ...cv.education.flatMap((e) => [e.qualification, ...e.details]),
    ...cv.leadership_and_interests.flatMap((i) => [i.title, i.description]),
    cv.referees,
  ].join("\n");
}

function collectLetterText(output: ApplicationOutputSuccess): string {
  const cl = output.cover_letter_content;
  return [cl.salutation, ...cl.paragraphs, cl.signoff].join("\n");
}

function computeAtsCoverage(output: ApplicationOutputSuccess): number {
  const cv = output.cv_content;
  const cvText = [
    cv.profile,
    ...cv.technical_skills.flatMap((g) => g.skills),
    ...cv.professional_experience.flatMap((r) => r.bullets),
    ...cv.key_projects.flatMap((p) => [...p.bullets, ...p.technologies]),
  ]
    .join(" ")
    .toLowerCase();
  const keywords = output.jd_analysis.ats_keywords.map((k) => k.toLowerCase());
  if (keywords.length === 0) return 1;
  const matched = keywords.filter((k) => cvText.includes(k)).length;
  return matched / keywords.length;
}

function countSentences(text: string): number {
  // Count terminal punctuation runs as sentence boundaries. Good enough
  // for the seniority bound check; not a full NLP tokeniser.
  const matches = text.match(/[.!?]+(?=\s|$)/g);
  return matches?.length ?? (text.trim().length > 0 ? 1 : 0);
}
