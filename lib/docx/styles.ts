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

// Graduate / Junior size profile. Mirrors what a user gets by selecting
// all body text in Word and pressing the "decrease font size" preset:
// 10.5 → 10pt body, 12 → 11pt section heading, 16 → 15pt name heading.
// Empirically, that single click was enough to drop a typical graduate
// CV from 3 pages to 2 (2026-05-01 user report). 9pt small/contact_line
// is at the ATS floor — acceptable for one-line meta text under role
// headers, but we don't push body below 10pt for the same reason.
export const SIZES_GRADUATE: SizeProfile = {
  body: 20, // 10pt (was 10.5pt)
  small: 18, // 9pt (was 9.5pt) — at the ATS floor
  contact_line: 18, // 9pt
  section_heading: 22, // 11pt (was 12pt)
  name_heading: 30, // 15pt (was 16pt)
} as const;

export function getSizesForSeniority(seniority: SeniorityLike): SizeProfile {
  return seniority === "Graduate" || seniority === "Junior"
    ? SIZES_GRADUATE
    : SIZES;
}

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

// Graduate / Junior density profile. Same fonts, same line-height,
// same heading rhythm — only the inter-paragraph and inter-bullet gaps
// shrink. The §4.4 Graduate page target is "1 to 2 pages, never more
// than 2", and graduate content (3-5 projects + internships + education
// detail + skills) tends to overflow at the default density. This is
// the renderer-side safety net; the system prompt's content budget is
// the primary lever (see Decision Log [9] 2026-04-30 follow-up).
export const SPACING_GRADUATE: SpacingProfile = {
  paragraph_after: 60, // 3pt (was 4pt)
  section_after: 180,
  heading_before: 180,
  heading_after: 60,
  bullet_after: 20, // 1pt (was 2pt)
  bullet_indent: 360,
  line_115: 276,
  line_15: 360,
} as const;

type SeniorityLike =
  | "Graduate"
  | "Junior"
  | "Mid"
  | "Senior"
  | "Lead"
  | "Principal";

export function getSpacingForSeniority(
  seniority: SeniorityLike,
): SpacingProfile {
  return seniority === "Graduate" || seniority === "Junior"
    ? SPACING_GRADUATE
    : SPACING;
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
