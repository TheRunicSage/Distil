// Renders the user's cover letter as a DOCX Buffer. Pure: JSON in,
// Buffer out. Layout reference: app_handoff_v8.md §5.4. The date string
// arrives already-resolved here; the inject-date Inngest step replaces
// the LLM's `{{TODAY}}` placeholder upstream. The signoff string carries
// embedded `\n` separators which we split into discrete paragraphs.
//
// Sizes use SIZES_COVER_LETTER (15pt name, 9pt contact line, 11pt body)
// so the header reads at the same visual weight as the CV's header
// while the body carries one preset above the CV's 10pt for breathing
// room on a one-page document.

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  type ISectionOptions,
} from "docx";
import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";
import { normaliseSalutation } from "@/lib/llm/normalise-salutation";
import {
  bodyParagraph,
  contactLine,
  nameHeading,
  pipeJoin,
  plainRun,
} from "./helpers";
import {
  FONTS,
  PAGE,
  SIZES_COVER_LETTER,
  SPACING,
} from "./styles";

type CoverLetterContent = ApplicationOutputSuccess["cover_letter_content"];

const SIZES = SIZES_COVER_LETTER;

export async function renderCoverLetter(
  content: CoverLetterContent,
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // 1. Sender block: name as a heading (matches the CV's name visual
  // weight), then phone | email | linkedin | location with the brand-
  // orange bottom rule via the shared contactLine helper.
  children.push(nameHeading(content.header.full_name, SPACING, SIZES));
  const senderContact = pipeJoin([
    content.header.phone,
    content.header.email,
    content.header.linkedin,
    content.header.location,
  ]);
  if (senderContact) {
    children.push(contactLine(senderContact, true, SPACING, SIZES));
  }

  // 2. Date — already resolved server-side (Pacific/Auckland today).
  children.push(
    new Paragraph({
      children: [plainRun(content.header.date, { sizes: SIZES })],
      spacing: {
        after: SPACING.section_after,
        line: SPACING.line_115,
        lineRule: "auto",
      },
    }),
  );

  // 3. Recipient block. Always recipient_line. Company name and address
  // are each conditional: omit the line if empty/null. The closing
  // section gap rides on whichever line ends up last.
  const recipientLines: string[] = [content.header.recipient_line];
  if (content.header.company_name && content.header.company_name.trim()) {
    recipientLines.push(content.header.company_name);
  }
  if (content.header.company_address && content.header.company_address.trim()) {
    recipientLines.push(content.header.company_address);
  }
  recipientLines.forEach((line, i) => {
    const isLast = i === recipientLines.length - 1;
    children.push(
      new Paragraph({
        children: [plainRun(line, { sizes: SIZES })],
        spacing: {
          after: isLast ? SPACING.section_after : 0,
          line: SPACING.line_115,
          lineRule: "auto",
        },
      }),
    );
  });

  // 4. Salutation — normalised to ensure a trailing comma (§5.2). The
  // prompt requires it; this is the defensive net for prompt drift.
  children.push(
    new Paragraph({
      children: [plainRun(normaliseSalutation(content.salutation), { sizes: SIZES })],
      spacing: {
        after: SPACING.section_after,
        line: SPACING.line_115,
        lineRule: "auto",
      },
    }),
  );

  // 5. Body paragraphs (locked at 4 by Zod). Left-aligned, not justified
  // — recruiters in NZ expect ragged-right body copy in cover letters.
  for (const para of content.paragraphs) {
    children.push(
      bodyParagraph(para, {
        afterTwips: SPACING.section_after,
        sizes: SIZES,
      }),
    );
  }

  // 6. Sign-off. The string contains "\n"; split into one paragraph per
  // line. "Nga mihi," then full name on the next line is the canonical
  // shape; we render whatever the LLM emitted.
  for (const line of content.signoff.split("\n")) {
    children.push(
      new Paragraph({
        children: [plainRun(line, { sizes: SIZES })],
        alignment: AlignmentType.LEFT,
        spacing: { after: 0, line: SPACING.line_115, lineRule: "auto" },
      }),
    );
  }

  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: PAGE.width, height: PAGE.height },
        margin: {
          top: PAGE.margin_top,
          bottom: PAGE.margin_bottom,
          left: PAGE.margin_left,
          right: PAGE.margin_right,
        },
      },
    },
    children,
  };

  const doc = new Document({
    creator: "Distil",
    styles: {
      default: {
        document: {
          run: { font: FONTS.body, size: SIZES.body },
        },
      },
    },
    sections: [section],
  });

  return Packer.toBuffer(doc);
}
