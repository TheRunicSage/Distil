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
