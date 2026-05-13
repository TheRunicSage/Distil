// Language-drift detection — guards the success output against the
// L1 (non-target-language characters) and L3 (Unicode invisibles)
// risk classes documented in docs/llm-output-risks.md. Triggered by
// the 2026-05-13 incident: DeepSeek V4 Flash emitted Chinese
// characters in an English cover letter (a documented upstream bug
// in the DeepSeek bilingual tokenizer; their 2025-09-22 V3.1-Terminus
// release notes name "Reduced occurrences of Chinese-English mixing
// and occasional abnormal characters" as a fix item — "reduced", not
// fixed, and V4 inherits the same lineage).
//
// Policy (per Decision Log [18] 2026-05-13):
//   - Zero tolerance: a single disallowed character in user-facing
//     output triggers a hard reject (llm_language_drift). Inngest
//     function-level retries (max 2) re-run with a fresh LLM call.
//   - Carve-outs:
//       (a) Target country uses a non-Latin script — the model is
//           expected to write in that script. e.g. target_country
//           = "Japan" allows Hiragana / Katakana / CJK Unified.
//       (b) Master CV provenance — any character that appears in
//           the user's parsed master CV is always allowed (covers
//           candidate names like "王芳" or "Søren Müller", school
//           names in the user's home script, place names in their
//           CV's existing prose).
//   - Default allowed set = ASCII printable + Latin-1 Supplement +
//     Latin Extended-A/B/C/Additional + General Punctuation
//     (minus dashes — handled by sanitise-output.ts) + Currency
//     Symbols + IPA + Combining Diacritical Marks + whitespace.
//     Covers every English-business country (NZ/AU/UK/US/IE/CA/ZA)
//     plus Māori macrons (ā ē ī ō ū) plus EU diacritics (é ñ ö ç ş ã).
//
// User-facing fields scanned: cv_content + cover_letter_content (both
// render to docx AND show in preview), plus the success-page hover
// fields (fit_assessment.reasoning, fit_assessment.warnings[],
// what_we_did_checklist[], salary_band.range). research_summary and
// jd_analysis are internal metadata, never user-facing — not scanned
// so a legitimate "researched Chinese company name" in
// research_summary doesn't trigger.

import "server-only";

import type { ApplicationOutputSuccess } from "./output-schema";

// --- Allowed Unicode ranges --------------------------------------

// Base allowed codepoint ranges. Every market we support uses Latin
// script as the primary business-document script; this set covers
// English + Māori (via Latin Extended-A) + Western/Central European
// diacritics + general typographic punctuation + currency.
//
// Smart quotes (' ' " ") and ellipsis (…) are intentionally included
// — they're general typographic punctuation. The em/en dash
// separately covered by sanitise-output.ts has its own strip pass.
//
// Newline (U+000A), tab (U+0009), and carriage return (U+000D) are
// included for any multi-line fields the renderer joins.
//
// NBSP (U+00A0) included — appears in legitimate addresses.
const LATIN_EXTENDED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0009, 0x0009], // tab
  [0x000a, 0x000a], // line feed
  [0x000d, 0x000d], // carriage return
  [0x0020, 0x007e], // ASCII printable
  [0x00a0, 0x00ff], // Latin-1 Supplement
  [0x0100, 0x017f], // Latin Extended-A (includes Māori macrons)
  [0x0180, 0x024f], // Latin Extended-B
  [0x0250, 0x02af], // IPA Extensions
  [0x02b0, 0x02ff], // Spacing Modifier Letters
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x1e00, 0x1eff], // Latin Extended Additional (Vietnamese etc.)
  [0x2000, 0x206f], // General Punctuation (smart quotes, ellipsis,
  //                    NBSP-variants — dashes handled separately)
  [0x20a0, 0x20cf], // Currency Symbols (€ £ ¥ etc.)
  [0x2c60, 0x2c7f], // Latin Extended-C
];

// Per-target-country script extensions. Built from the user's
// 2026-05-13 directive — when documents are mandated in the target
// country's native script, allow that script's full block set on
// top of the Latin base.
//
// Country names match what research_summary.target_country emits
// (full English name, per system prompt §4.2). Aliases included for
// common variants ("UAE" / "United Arab Emirates", "Korea" / "South
// Korea"). Case-insensitive lookup applied at the call site.

type ScriptName =
  | "cjk_unified"
  | "hiragana"
  | "katakana"
  | "katakana_phonetic"
  | "cjk_symbols"
  | "halfwidth_fullwidth"
  | "hangul_syllables"
  | "hangul_jamo"
  | "hangul_compat"
  | "cyrillic"
  | "cyrillic_supplement"
  | "cyrillic_ext_a"
  | "cyrillic_ext_b"
  | "greek"
  | "greek_extended"
  | "hebrew"
  | "arabic"
  | "arabic_supplement"
  | "arabic_ext_a"
  | "arabic_presentation_a"
  | "arabic_presentation_b"
  | "thai"
  | "devanagari"
  | "bengali"
  | "tamil"
  | "telugu"
  | "kannada"
  | "malayalam"
  | "gurmukhi"
  | "sinhala"
  | "myanmar"
  | "khmer"
  | "lao"
  | "ethiopic"
  | "ethiopic_supplement"
  | "armenian"
  | "georgian";

const SCRIPT_RANGES: Record<ScriptName, readonly [number, number]> = {
  cjk_unified: [0x4e00, 0x9fff],
  hiragana: [0x3040, 0x309f],
  katakana: [0x30a0, 0x30ff],
  katakana_phonetic: [0x31f0, 0x31ff],
  cjk_symbols: [0x3000, 0x303f],
  halfwidth_fullwidth: [0xff00, 0xffef],
  hangul_syllables: [0xac00, 0xd7af],
  hangul_jamo: [0x1100, 0x11ff],
  hangul_compat: [0x3130, 0x318f],
  cyrillic: [0x0400, 0x04ff],
  cyrillic_supplement: [0x0500, 0x052f],
  cyrillic_ext_a: [0x2de0, 0x2dff],
  cyrillic_ext_b: [0xa640, 0xa69f],
  greek: [0x0370, 0x03ff],
  greek_extended: [0x1f00, 0x1fff],
  hebrew: [0x0590, 0x05ff],
  arabic: [0x0600, 0x06ff],
  arabic_supplement: [0x0750, 0x077f],
  arabic_ext_a: [0x08a0, 0x08ff],
  arabic_presentation_a: [0xfb50, 0xfdff],
  arabic_presentation_b: [0xfe70, 0xfeff],
  thai: [0x0e00, 0x0e7f],
  devanagari: [0x0900, 0x097f],
  bengali: [0x0980, 0x09ff],
  tamil: [0x0b80, 0x0bff],
  telugu: [0x0c00, 0x0c7f],
  kannada: [0x0c80, 0x0cff],
  malayalam: [0x0d00, 0x0d7f],
  gurmukhi: [0x0a00, 0x0a7f],
  sinhala: [0x0d80, 0x0dff],
  myanmar: [0x1000, 0x109f],
  khmer: [0x1780, 0x17ff],
  lao: [0x0e80, 0x0eff],
  ethiopic: [0x1200, 0x137f],
  ethiopic_supplement: [0x1380, 0x139f],
  armenian: [0x0530, 0x058f],
  georgian: [0x10a0, 0x10ff],
};

const CJK_FULL: ScriptName[] = [
  "cjk_unified",
  "cjk_symbols",
  "halfwidth_fullwidth",
];
const JAPANESE: ScriptName[] = [...CJK_FULL, "hiragana", "katakana", "katakana_phonetic"];
const KOREAN: ScriptName[] = [
  ...CJK_FULL,
  "hangul_syllables",
  "hangul_jamo",
  "hangul_compat",
];
const CYRILLIC_FULL: ScriptName[] = [
  "cyrillic",
  "cyrillic_supplement",
  "cyrillic_ext_a",
  "cyrillic_ext_b",
];
const ARABIC_FULL: ScriptName[] = [
  "arabic",
  "arabic_supplement",
  "arabic_ext_a",
  "arabic_presentation_a",
  "arabic_presentation_b",
];
const GREEK_FULL: ScriptName[] = ["greek", "greek_extended"];
const ETHIOPIC_FULL: ScriptName[] = ["ethiopic", "ethiopic_supplement"];

// Country → scripts that supplement the Latin base. Country names are
// normalised to lowercase at lookup time. Aliases for the common
// variants the model might emit.
const COUNTRY_SCRIPTS: Record<string, ScriptName[]> = {
  // CJK markets
  "china": CJK_FULL,
  "people's republic of china": CJK_FULL,
  "mainland china": CJK_FULL,
  "taiwan": CJK_FULL,
  "republic of china": CJK_FULL,
  "hong kong": CJK_FULL,
  "hong kong sar": CJK_FULL,
  "macau": CJK_FULL,
  "macao": CJK_FULL,
  "singapore": CJK_FULL,
  "japan": JAPANESE,
  "south korea": KOREAN,
  "korea": KOREAN,
  "republic of korea": KOREAN,
  "north korea": KOREAN,

  // Cyrillic markets
  "russia": CYRILLIC_FULL,
  "russian federation": CYRILLIC_FULL,
  "belarus": CYRILLIC_FULL,
  "ukraine": CYRILLIC_FULL,
  "bulgaria": CYRILLIC_FULL,
  "serbia": CYRILLIC_FULL,
  "montenegro": CYRILLIC_FULL,
  "north macedonia": CYRILLIC_FULL,
  "kazakhstan": CYRILLIC_FULL,
  "kyrgyzstan": CYRILLIC_FULL,
  "tajikistan": CYRILLIC_FULL,
  "mongolia": CYRILLIC_FULL,

  // Other European
  "greece": GREEK_FULL,
  "cyprus": GREEK_FULL,
  "armenia": ["armenian"],
  "georgia": ["georgian"],

  // Middle East
  "israel": ["hebrew"],
  "saudi arabia": ARABIC_FULL,
  "united arab emirates": ARABIC_FULL,
  "uae": ARABIC_FULL,
  "qatar": ARABIC_FULL,
  "kuwait": ARABIC_FULL,
  "bahrain": ARABIC_FULL,
  "oman": ARABIC_FULL,
  "egypt": ARABIC_FULL,
  "jordan": ARABIC_FULL,
  "lebanon": ARABIC_FULL,
  "iraq": ARABIC_FULL,
  "syria": ARABIC_FULL,
  "yemen": ARABIC_FULL,
  "iran": ARABIC_FULL,
  "afghanistan": ARABIC_FULL,
  "pakistan": ARABIC_FULL,
  "palestine": ARABIC_FULL,

  // North Africa
  "morocco": ARABIC_FULL,
  "tunisia": ARABIC_FULL,
  "algeria": ARABIC_FULL,
  "libya": ARABIC_FULL,
  "sudan": ARABIC_FULL,
  "mauritania": ARABIC_FULL,

  // South Asia
  "india": [
    "devanagari",
    "tamil",
    "telugu",
    "kannada",
    "malayalam",
    "gurmukhi",
    "bengali",
  ],
  "nepal": ["devanagari"],
  "bangladesh": ["bengali"],
  "sri lanka": ["sinhala", "tamil"],

  // Southeast Asia
  "thailand": ["thai"],
  "myanmar": ["myanmar"],
  "burma": ["myanmar"],
  "cambodia": ["khmer"],
  "laos": ["lao"],

  // Africa
  "ethiopia": ETHIOPIC_FULL,
  "eritrea": ETHIOPIC_FULL,
};

// --- Public types ------------------------------------------------

export type LanguageDriftFinding = {
  // Schema path of the affected field. Joined with "." to match the
  // zod_issues style; admin/logs grep-greps cleanly.
  path: string;
  // The disallowed substring with a small amount of surrounding
  // context for the operator's sanity check. Capped at ~80 chars.
  sample: string;
  // Unique disallowed codepoints in this field, formatted as
  // "U+XXXX" so they read in admin/logs without copy-paste hassle.
  codepoints: string[];
  // Total count of disallowed-char occurrences in this field.
  count: number;
};

// --- Core matcher build ------------------------------------------

function buildAllowedSet(
  targetCountry: string | null | undefined,
  masterCvText: string,
): (codepoint: number) => boolean {
  // The country script extensions are added on top of the Latin base.
  // Unknown / missing target_country → Latin base only (the most
  // conservative default; if the model is generating in a non-Latin
  // script for an unknown country, that's exactly what we want to
  // catch).
  const extraScripts: ScriptName[] = (() => {
    if (!targetCountry) return [];
    const key = targetCountry.trim().toLowerCase();
    return COUNTRY_SCRIPTS[key] ?? [];
  })();

  const ranges: Array<readonly [number, number]> = [...LATIN_EXTENDED_RANGES];
  for (const scriptName of extraScripts) {
    ranges.push(SCRIPT_RANGES[scriptName]);
  }

  // Master CV provenance — every codepoint that appears in the
  // parsed master CV text is allowed in output. Covers candidate
  // names, school names, place names, and any prose the candidate
  // wrote in their CV.
  const masterCvCodepoints = new Set<number>();
  for (const ch of masterCvText) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) masterCvCodepoints.add(cp);
  }

  return (cp: number) => {
    if (masterCvCodepoints.has(cp)) return true;
    for (const [start, end] of ranges) {
      if (cp >= start && cp <= end) return true;
    }
    return false;
  };
}

// --- Scanning ----------------------------------------------------

// Up-to-80-char sample window around the first disallowed char in a
// field. Centred on the offending codepoint so the operator can see
// the surrounding context.
function buildSample(value: string, firstBadIndex: number): string {
  const start = Math.max(0, firstBadIndex - 32);
  const end = Math.min(value.length, firstBadIndex + 48);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < value.length ? "..." : "";
  return prefix + value.slice(start, end) + suffix;
}

function scanField(
  path: string,
  value: string | null,
  allowed: (cp: number) => boolean,
): LanguageDriftFinding | null {
  if (!value) return null;
  const badCodepoints = new Set<number>();
  let firstBadIndex = -1;
  let count = 0;
  let charIndex = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && !allowed(cp)) {
      if (firstBadIndex < 0) firstBadIndex = charIndex;
      badCodepoints.add(cp);
      count += 1;
    }
    // Advance by UTF-16 code-unit count so the slice indices in
    // buildSample match what String.prototype.slice expects.
    charIndex += ch.length;
  }
  if (count === 0) return null;
  return {
    path,
    sample: buildSample(value, firstBadIndex),
    codepoints: Array.from(badCodepoints)
      .sort((a, b) => a - b)
      .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`),
    count,
  };
}

// Walk every user-facing string field of the success output. Order
// is the same order they appear in the schema for grep-friendliness.
function* enumerateUserFacingStrings(
  output: ApplicationOutputSuccess,
): Generator<{ path: string; value: string | null }> {
  const cv = output.cv_content;
  const cl = output.cover_letter_content;

  // cv_content.contact_details
  yield { path: "cv.contact_details.full_name", value: cv.contact_details.full_name };
  yield { path: "cv.contact_details.location", value: cv.contact_details.location };
  yield { path: "cv.contact_details.phone", value: cv.contact_details.phone };
  yield { path: "cv.contact_details.email", value: cv.contact_details.email };
  yield { path: "cv.contact_details.linkedin", value: cv.contact_details.linkedin };
  yield { path: "cv.contact_details.work_rights", value: cv.contact_details.work_rights };
  yield { path: "cv.contact_details.availability", value: cv.contact_details.availability };

  // cv_content
  yield { path: "cv.profile", value: cv.profile };
  yield { path: "cv.referees", value: cv.referees };

  // cv_content.technical_skills — for-loops (not forEach) so yield
  // works inside the generator. Same shape as below.
  for (let gi = 0; gi < cv.technical_skills.length; gi++) {
    const group = cv.technical_skills[gi];
    yield { path: `cv.technical_skills[${gi}].category`, value: group.category };
    for (let si = 0; si < group.skills.length; si++) {
      yield { path: `cv.technical_skills[${gi}].skills[${si}]`, value: group.skills[si] };
    }
  }

  // cv_content.professional_experience
  for (let ri = 0; ri < cv.professional_experience.length; ri++) {
    const role = cv.professional_experience[ri];
    yield { path: `cv.professional_experience[${ri}].role_title`, value: role.role_title };
    yield { path: `cv.professional_experience[${ri}].company`, value: role.company };
    yield { path: `cv.professional_experience[${ri}].location`, value: role.location };
    yield { path: `cv.professional_experience[${ri}].start_date`, value: role.start_date };
    yield { path: `cv.professional_experience[${ri}].end_date`, value: role.end_date };
    for (let bi = 0; bi < role.bullets.length; bi++) {
      yield { path: `cv.professional_experience[${ri}].bullets[${bi}]`, value: role.bullets[bi] };
    }
  }

  // cv_content.key_projects
  for (let pi = 0; pi < cv.key_projects.length; pi++) {
    const proj = cv.key_projects[pi];
    yield { path: `cv.key_projects[${pi}].name`, value: proj.name };
    yield { path: `cv.key_projects[${pi}].context`, value: proj.context };
    for (let bi = 0; bi < proj.bullets.length; bi++) {
      yield { path: `cv.key_projects[${pi}].bullets[${bi}]`, value: proj.bullets[bi] };
    }
    for (let ti = 0; ti < proj.technologies.length; ti++) {
      yield { path: `cv.key_projects[${pi}].technologies[${ti}]`, value: proj.technologies[ti] };
    }
  }

  // cv_content.education
  for (let ei = 0; ei < cv.education.length; ei++) {
    const ed = cv.education[ei];
    yield { path: `cv.education[${ei}].qualification`, value: ed.qualification };
    yield { path: `cv.education[${ei}].institution`, value: ed.institution };
    yield { path: `cv.education[${ei}].location`, value: ed.location };
    yield { path: `cv.education[${ei}].dates`, value: ed.dates };
    for (let di = 0; di < ed.details.length; di++) {
      yield { path: `cv.education[${ei}].details[${di}]`, value: ed.details[di] };
    }
  }

  // cv_content.leadership_and_interests
  for (let ii = 0; ii < cv.leadership_and_interests.length; ii++) {
    const item = cv.leadership_and_interests[ii];
    yield { path: `cv.leadership_and_interests[${ii}].title`, value: item.title };
    yield { path: `cv.leadership_and_interests[${ii}].description`, value: item.description };
  }

  // cover_letter_content.header (no separate sender object — the
  // header carries both sender and recipient fields)
  yield { path: "cover_letter.header.full_name", value: cl.header.full_name };
  yield { path: "cover_letter.header.phone", value: cl.header.phone };
  yield { path: "cover_letter.header.email", value: cl.header.email };
  yield { path: "cover_letter.header.linkedin", value: cl.header.linkedin };
  yield { path: "cover_letter.header.location", value: cl.header.location };
  yield { path: "cover_letter.header.date", value: cl.header.date };
  yield { path: "cover_letter.header.recipient_line", value: cl.header.recipient_line };
  yield { path: "cover_letter.header.company_name", value: cl.header.company_name };
  yield { path: "cover_letter.header.company_address", value: cl.header.company_address };

  // cover_letter_content body
  yield { path: "cover_letter.salutation", value: cl.salutation };
  for (let pi = 0; pi < cl.paragraphs.length; pi++) {
    yield { path: `cover_letter.paragraphs[${pi}]`, value: cl.paragraphs[pi] };
  }
  yield { path: "cover_letter.signoff", value: cl.signoff };

  // success-page hover panel content (fit_assessment + what_we_did
  // + salary_band.range). These render in the UI even though they
  // don't go into the docx — the user sees them so they're in
  // scope for L1.
  yield { path: "fit_assessment.reasoning", value: output.fit_assessment.reasoning };
  for (let wi = 0; wi < output.fit_assessment.warnings.length; wi++) {
    yield { path: `fit_assessment.warnings[${wi}]`, value: output.fit_assessment.warnings[wi] };
  }
  for (let ii = 0; ii < output.what_we_did_checklist.length; ii++) {
    yield { path: `what_we_did_checklist[${ii}]`, value: output.what_we_did_checklist[ii] };
  }
  yield { path: "salary_band.range", value: output.salary_band.range };
}

// --- Public detect API -------------------------------------------

const MAX_FINDINGS = 20;

export type LanguageDriftScanResult = {
  // Empty array means clean. Caller throws on length > 0.
  findings: LanguageDriftFinding[];
  // Total disallowed-char count across all fields (for log metadata
  // even when findings were truncated to MAX_FINDINGS).
  totalCount: number;
  // For ops visibility — what target country drove the allowlist.
  // null = unknown country / Latin-base only.
  targetCountry: string | null;
};

export function detectLanguageDrift(
  output: ApplicationOutputSuccess,
  masterCvText: string,
): LanguageDriftScanResult {
  const targetCountry = output.research_summary?.target_country ?? null;
  const allowed = buildAllowedSet(targetCountry, masterCvText);

  const findings: LanguageDriftFinding[] = [];
  let totalCount = 0;

  for (const { path, value } of enumerateUserFacingStrings(output)) {
    const finding = scanField(path, value, allowed);
    if (finding) {
      totalCount += finding.count;
      if (findings.length < MAX_FINDINGS) findings.push(finding);
    }
  }

  return {
    findings,
    totalCount,
    targetCountry: targetCountry || null,
  };
}
