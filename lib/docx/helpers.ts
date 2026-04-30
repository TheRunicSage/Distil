// Reusable paragraph builders for the CV and cover letter renderers.
// Pure functions: input data, output Paragraph nodes. Caller assembles
// the final document. Keeps render-cv.ts / render-cover-letter.ts at the
// "list of sections" level rather than fussing with TextRun configs.

import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  TextRun,
  type ParagraphChild,
} from "docx";
import {
  COLOURS,
  FONTS,
  SIZES,
  SPACING,
  type SizeProfile,
  type SpacingProfile,
} from "./styles";

// Helpers default to the canonical SPACING + SIZES profiles. The CV
// renderer passes the dense profiles (SPACING_DENSE + SIZES_DENSE)
// for every seniority since 2026-05-01; cover letter renderer keeps
// the canonical defaults for the more polished/spacious feel.

// Filters out null/undefined/empty values, then joins with " | ". Used
// for contact lines and "Location | Dates" sub-rows. Without the filter
// you get stray pipes when (for example) phone is missing.
export function pipeJoin(
  parts: ReadonlyArray<string | null | undefined>,
): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" | ");
}

export function nameHeading(
  fullName: string,
  spacing: SpacingProfile = SPACING,
  sizes: SizeProfile = SIZES,
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: fullName,
        bold: true,
        font: FONTS.heading,
        size: sizes.name_heading,
      }),
    ],
    spacing: { after: spacing.paragraph_after },
  });
}

// Contact paragraph with a brand-orange bottom rule on the closing line.
// The orange rule is the document's main brand signature; the rest of
// the body stays black for ATS reliability and readability.
export function contactLine(
  text: string,
  withRule: boolean,
  spacing: SpacingProfile = SPACING,
  sizes: SizeProfile = SIZES,
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONTS.body,
        size: sizes.contact_line,
        color: COLOURS.dark_grey,
      }),
    ],
    spacing: {
      after: withRule ? spacing.section_after : spacing.paragraph_after,
      line: spacing.line_115,
      lineRule: "auto",
    },
    border: withRule
      ? {
          bottom: {
            color: COLOURS.brand_orange,
            space: 4,
            style: BorderStyle.SINGLE,
            size: 8, // eighths-of-a-point: 8 = 1pt
          },
        }
      : undefined,
  });
}

// Section heading: "PROFILE", "TECHNICAL SKILLS", etc. Bold all-caps
// in Curiosum brand orange with a paler-orange bottom rule. ATS parsers
// tolerate solid-color heading text well; the bold + caps + rule
// combination is the textual cue parsers actually key on.
export function sectionHeading(
  text: string,
  spacing: SpacingProfile = SPACING,
  sizes: SizeProfile = SIZES,
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        font: FONTS.heading,
        size: sizes.section_heading,
        color: COLOURS.brand_orange,
        characterSpacing: 10, // ~0.5pt tracking, very light
      }),
    ],
    spacing: {
      before: spacing.heading_before,
      after: spacing.heading_after,
    },
    border: {
      bottom: {
        color: COLOURS.brand_orange_dim,
        space: 2,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    keepNext: true,
  });
}

// Plain body paragraph (Profile, Referees, single-paragraph items).
export function bodyParagraph(
  text: string,
  opts: {
    justified?: boolean;
    afterTwips?: number;
    spacing?: SpacingProfile;
    sizes?: SizeProfile;
  } = {},
): Paragraph {
  const spacing = opts.spacing ?? SPACING;
  const sizes = opts.sizes ?? SIZES;
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONTS.body,
        size: sizes.body,
        color: COLOURS.black,
      }),
    ],
    alignment: opts.justified ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    spacing: {
      after: opts.afterTwips ?? spacing.paragraph_after,
      line: spacing.line_115,
      lineRule: "auto",
    },
  });
}

// Bullet item via Word's List Bullet style. 0.25in indent, hanging.
export function bullet(
  text: string,
  spacing: SpacingProfile = SPACING,
  sizes: SizeProfile = SIZES,
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONTS.body,
        size: sizes.body,
        color: COLOURS.black,
      }),
    ],
    bullet: { level: 0 },
    indent: { left: spacing.bullet_indent, hanging: spacing.bullet_indent },
    spacing: {
      after: spacing.bullet_after,
      line: spacing.line_115,
      lineRule: "auto",
    },
  });
}

// "Role Title, Company" bold first line of a role block. keepNext keeps
// the role header on the same page as its first bullet.
export function roleHeader(
  parts: ReadonlyArray<TextRun>,
  spacing: SpacingProfile = SPACING,
): Paragraph {
  return new Paragraph({
    children: parts as unknown as ParagraphChild[],
    spacing: {
      before: spacing.paragraph_after,
      after: 0,
      line: spacing.line_115,
      lineRule: "auto",
    },
    keepNext: true,
  });
}

// 10pt grey "Location | Dates" line under a role / education / project.
export function metaLine(
  text: string,
  spacing: SpacingProfile = SPACING,
  sizes: SizeProfile = SIZES,
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONTS.body,
        size: sizes.small,
        color: COLOURS.medium_grey,
      }),
    ],
    spacing: {
      after: spacing.paragraph_after,
      line: spacing.line_115,
      lineRule: "auto",
    },
    keepNext: true,
  });
}

// Bold prefix + plain remainder. Used for "Category: skill, skill" rows
// and for the "Project Name | Context (italic)" header line.
export function boldPrefixRun(
  prefix: string,
  sizes: SizeProfile = SIZES,
): TextRun {
  return new TextRun({
    text: prefix,
    bold: true,
    font: FONTS.body,
    size: sizes.body,
    color: COLOURS.black,
  });
}

export function plainRun(
  text: string,
  opts: {
    italic?: boolean;
    bold?: boolean;
    small?: boolean;
    grey?: boolean;
    sizes?: SizeProfile;
  } = {},
): TextRun {
  const sizes = opts.sizes ?? SIZES;
  return new TextRun({
    text,
    italics: opts.italic,
    bold: opts.bold,
    font: FONTS.body,
    size: opts.small ? sizes.small : sizes.body,
    color: opts.grey ? COLOURS.medium_grey : COLOURS.black,
  });
}
