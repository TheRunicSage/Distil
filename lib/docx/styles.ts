// Shared style constants for the DOCX renderers. Calibri throughout, A4
// page, 20mm margins, no headers/footers/columns/tables. ATS-first by
// design: the user's CV and cover letter are not Curiosum-branded (see
// app_handoff_v8.md §5.1 v8 note).
//
// Half-points (size), twentieths-of-a-point (twips), and EMU appear here
// because the docx package mixes units. Keep all magic numbers in this
// file; render-* and helpers should reference these constants only.

export const FONTS = {
  body: "Calibri",
  heading: "Calibri",
} as const;

// docx package expects half-points: 22 = 11pt.
export const SIZES = {
  body: 22, // 11pt
  small: 20, // 10pt
  contact_line: 20, // 10pt
  section_heading: 26, // 13pt
  name_heading: 36, // 18pt
} as const;

export const COLOURS = {
  black: "000000",
  dark_grey: "333333",
  medium_grey: "666666",
  rule: "BFBFBF",
} as const;

// docx expects twips for spacing: 240 = 12pt, 20 twips = 1pt.
export const SPACING = {
  paragraph_after: 120, // 6pt
  section_after: 240, // 12pt
  heading_before: 240,
  heading_after: 80,
  bullet_indent: 360, // 0.25 inch
  // Body line-height as 240ths-of-a-line via the docx "auto" lineRule:
  // 276 ≈ 1.15 spacing (the spec's body default).
  line_115: 276,
  line_15: 360,
} as const;

// A4 in twips: 11906 x 16838. 1134 twips ≈ 2cm = 20mm.
export const PAGE = {
  width: 11906,
  height: 16838,
  margin_top: 1134,
  margin_bottom: 1134,
  margin_left: 1134,
  margin_right: 1134,
} as const;
