// Shared style constants for the DOCX renderers. Calibri throughout, A4
// page, 15mm margins, no headers/footers/columns/tables. ATS-first by
// design: solid color text in headings is ATS-safe; the original "no
// branding" rule from app_handoff_v8.md §5.1 v8 was relaxed 2026-04-30
// per user request — Curiosum brand orange is now applied to section
// headings and the contact rule. Body text stays black for readability
// and ATS reliability.
//
// Half-points (size), twentieths-of-a-point (twips), and EMU appear here
// because the docx package mixes units. Keep all magic numbers in this
// file; render-* and helpers should reference these constants only.

export const FONTS = {
  body: "Calibri",
  heading: "Calibri",
} as const;

// docx package expects half-points: 21 = 10.5pt, 22 = 11pt, 24 = 12pt.
// Sizes lowered 2026-04-30 to land a typical Mid/Senior CV on 2 pages
// instead of 3. 10.5pt body remains comfortably above the 9pt ATS floor.
export const SIZES = {
  body: 21, // 10.5pt
  small: 19, // 9.5pt
  contact_line: 19, // 9.5pt
  section_heading: 24, // 12pt
  name_heading: 32, // 16pt
} as const;

// Structural type so alternative size profiles (SIZES_GRADUATE, future
// per-seniority variants) aren't pinned to the literal numbers in the
// canonical profile.
export type SizeProfile = {
  readonly body: number;
  readonly small: number;
  readonly contact_line: number;
  readonly section_heading: number;
  readonly name_heading: number;
};

// Dense size profile — the CV default since 2026-05-01. Mirrors what a
// user gets by selecting all body text in Word and pressing the
// "decrease font size" preset once: 10.5 → 10pt body, 12 → 11pt
// section heading, 16 → 15pt name heading. Originally graduate-only
// (Decision Log [9] 2026-04-30); user feedback was "I can easily
// read it and it's more information packed instead of cramped",
// so it now applies to every CV. Cover letter stays at the canonical
// SIZES profile above for the more polished/spacious feel.
//
// 9pt small/contact_line is at the ATS floor — only used for one-line
// meta text under role headers and the contact line, never for body.
// Body stays at 10pt minimum.
export const SIZES_DENSE: SizeProfile = {
  body: 20, // 10pt (was 10.5pt in canonical)
  small: 18, // 9pt (was 9.5pt) — at the ATS floor
  contact_line: 18, // 9pt
  section_heading: 22, // 11pt (was 12pt)
  name_heading: 30, // 15pt (was 16pt)
} as const;

// Future-flex hook (see getSpacingForSeniority above): every CV uses
// the dense profile today, regardless of seniority.
export function getSizesForSeniority(_seniority: SeniorityLike): SizeProfile {
  return SIZES_DENSE;
}

// Cover letter size profile (2026-05-01 user feedback). The cover
// letter is a one-page document with a generous header and four
// body paragraphs, so it can carry slightly larger body type than
// the CV while keeping the contact-line meta tight.
//
// Header: name 15pt and contact_line 9pt match the CV's dense
// profile so a candidate's name reads at the same visual weight in
// both documents (previously the name was at body size, ~10.5pt,
// which felt small next to the CV's 15pt name heading).
//
// Body: 11pt is one preset above the CV's 10pt — gives the
// four-paragraph flow more breathing room without forcing a
// second page.
export const SIZES_COVER_LETTER: SizeProfile = {
  body: 22, // 11pt
  small: 18, // 9pt — meta only (sender contact line)
  contact_line: 18, // 9pt — matches CV
  section_heading: 22, // unused by cover letter; kept for type completeness
  name_heading: 30, // 15pt — matches CV
} as const;

// Curiosum brand orange (#E85A0E) drives the visual signature: section
// headings and the contact rule. brand_orange_dim is a paler tint for
// the section-heading bottom rule so the orange line doesn't fight the
// orange text. Body / bullet text stays black for readability.
export const COLOURS = {
  black: "000000",
  dark_grey: "333333",
  medium_grey: "666666",
  rule: "BFBFBF",
  brand_orange: "E85A0E",
  brand_orange_dim: "F4B58E",
} as const;

// docx expects twips for spacing: 240 = 12pt, 20 twips = 1pt.
// Spacing tightened 2026-04-30 to match the smaller font sizes; the
// vertical rhythm scales with body size so the page still breathes.
export const SPACING = {
  paragraph_after: 80, // 4pt
  section_after: 180, // 9pt
  heading_before: 180, // 9pt
  heading_after: 60, // 3pt
  bullet_after: 40, // 2pt
  bullet_indent: 360, // 0.25 inch
  // Body line-height as 240ths-of-a-line via the docx "auto" lineRule:
  // 276 ≈ 1.15 spacing (the spec's body default). Kept at 1.15 — going
  // tighter than this starts to feel cramped at 10.5pt body.
  line_115: 276,
  line_15: 360,
} as const;

// Structural type rather than `typeof SPACING`, so alternative profiles
// (SPACING_GRADUATE, future per-seniority variants) aren't pinned to the
// literal numbers in the canonical profile.
export type SpacingProfile = {
  readonly paragraph_after: number;
  readonly section_after: number;
  readonly heading_before: number;
  readonly heading_after: number;
  readonly bullet_after: number;
  readonly bullet_indent: number;
  readonly line_115: number;
  readonly line_15: number;
};

// Dense density profile — the CV default since 2026-05-01. Originally
// introduced as a graduate-only safety net (Decision Log [9]
// 2026-04-30); user feedback was "more information packed instead of
// cramped, prefer this throughout", so it now applies to every CV
// regardless of seniority. The canonical SPACING above is retained
// for the cover letter and any future caller that wants the older
// looser profile.
export const SPACING_DENSE: SpacingProfile = {
  paragraph_after: 60, // 3pt (was 4pt in canonical)
  section_after: 180,
  heading_before: 180,
  heading_after: 60,
  bullet_after: 20, // 1pt (was 2pt in canonical)
  bullet_indent: 360,
  line_115: 276,
  line_15: 360,
} as const;

// Cover-letter spacing profile (2026-05-12). Cover letters with four
// paragraphs at ~230 words were top-anchoring on a half-empty A4 page
// — visually thin even when the content was strong. Two coupled
// remedies: bump the prompt to target five paragraphs (Opening /
// Story 1 / Story 2 / Company Connection / Closing, ~380-440 words)
// AND expand the structural gaps in the renderer so the letter fills
// the page as a balanced unit.
//
// Two distinct gap classes are now modelled:
//   - Structural air (between major sections — header→date,
//     date→recipient, recipient→salutation, salutation→first body
//     paragraph, last body paragraph→sign-off): expanded to 14pt
//     via `section_after`. Was 9pt; was the same value the body
//     paragraphs also used, which is why the letter read as
//     uniformly cramped at the structural seams.
//   - Body-paragraph rhythm (between body paragraphs of the
//     cover letter): unchanged at 9pt via new `body_paragraph_after`
//     field. Renderer uses this between body paragraphs and
//     switches to `section_after` only for the gap above the
//     sign-off. Keeps the body reading as one coherent letter
//     while the surrounding structure breathes.
//
// Magnitudes vs canonical SPACING:
//   section_after          180 → 280 (9pt → 14pt)  — structural air
//   body_paragraph_after   N/A → 180 (9pt)         — new field
//   paragraph_after         80 →  80 (4pt unchanged)
//   signoff_between          0 →  80 (0pt → 4pt)   — new field
//   bullet_after / bullet_indent: unused by cover letter, kept
//                                 for type completeness.
//   line_115 / line_15:    unchanged — line-height stays at 1.15.
export const SPACING_COVER_LETTER: SpacingProfile & {
  readonly body_paragraph_after: number;
  readonly signoff_between: number;
} = {
  paragraph_after: 80, // 4pt
  section_after: 280, // 14pt — structural air (was 9pt)
  heading_before: 180,
  heading_after: 60,
  bullet_after: 40,
  bullet_indent: 360,
  line_115: 276,
  line_15: 360,
  body_paragraph_after: 180, // 9pt — between body paragraphs only
  signoff_between: 80, // 4pt — between sign-off lines
} as const;

type SeniorityLike =
  | "Graduate"
  | "Junior"
  | "Mid"
  | "Senior"
  | "Lead"
  | "Principal";

// CV always uses the dense profile now; the seniority parameter is
// retained as a future-flex hook (e.g. Lead/Principal could opt back
// to the looser canonical if a different rhythm reads better at the
// strategic level).
export function getSpacingForSeniority(
  _seniority: SeniorityLike,
): SpacingProfile {
  return SPACING_DENSE;
}

// A4 in twips: 11906 x 16838. 850 twips ≈ 1.5cm = 15mm. Tighter than
// the original 20mm but still comfortably ATS-safe.
export const PAGE = {
  width: 11906,
  height: 16838,
  margin_top: 850,
  margin_bottom: 850,
  margin_left: 850,
  margin_right: 850,
} as const;
