// Renders the user's cover letter as a DOCX Buffer. Pure: JSON in,
// Buffer out. Layout reference: app_handoff_v8.md §5.4. The date string
// arrives already-resolved here; the inject-date Inngest step replaces
// the LLM's `{{TODAY}}` placeholder upstream. The signoff string carries
// embedded `\n` separators which we split into discrete paragraphs.

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  type ISectionOptions,
} from "docx";
import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";
import {
  bodyParagraph,
  contactLine,
  pipeJoin,
  plainRun,
} from "./helpers";
import { FONTS, PAGE, SIZES, SPACING } from "./styles";

type CoverLetterContent = ApplicationOutputSuccess["cover_letter_content"];

export async function renderCoverLetter(
  content: CoverLetterContent,
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // 1. Sender block: name (bold), then phone | email | linkedin | location.
  // The contact line carries the brand-orange bottom rule via the shared
  // contactLine helper, mirroring the CV's contact-block treatment so the
  // two documents share a visual signature.
  children.push(
    new Paragraph({
      children: [plainRun(content.header.full_name, { bold: true })],
      spacing: { after: 0, line: SPACING.line_115, lineRule: "auto" },
    }),
  );
  const senderContact = pipeJoin([
    content.header.phone,
    content.header.email,
    content.header.linkedin,
    content.header.location,
  ]);
  if (senderContact) {
    children.push(contactLine(senderContact, true));
  }

  // 2. Date — already resolved server-side (Pacific/Auckland today).
  children.push(
    new Paragraph({
      children: [plainRun(content.header.date)],
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
        children: [plainRun(line)],
        spacing: {
          after: isLast ? SPACING.section_after : 0,
          line: SPACING.line_115,
          lineRule: "auto",
        },
      }),
    );
  });

  // 4. Salutation
  children.push(
    new Paragraph({
      children: [plainRun(content.salutation)],
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
    children.push(bodyParagraph(para, { afterTwips: SPACING.section_after }));
  }

  // 6. Sign-off. The string contains "\n"; split into one paragraph per
  // line. "Nga mihi," then full name on the next line is the canonical
  // shape; we render whatever the LLM emitted.
  for (const line of content.signoff.split("\n")) {
    children.push(
      new Paragraph({
        children: [plainRun(line)],
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
