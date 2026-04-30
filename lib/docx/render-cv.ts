// Renders the user's CV as a DOCX Buffer. Pure: JSON in, Buffer out.
// Caller (Inngest render-and-upload step) is responsible for storage.
//
// Layout reference: app_handoff_v8.md §5.3. Section ordering matches the
// system prompt §4.1. Empty Technical Skills / Key Projects / Leadership
// sections are omitted entirely (heading and all). Filename concerns
// belong to the download route, not here.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  type ISectionOptions,
} from "docx";
import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";
import {
  bodyParagraph,
  boldPrefixRun,
  bullet,
  contactLine,
  metaLine,
  nameHeading,
  pipeJoin,
  plainRun,
  roleHeader,
  sectionHeading,
} from "./helpers";
import { FONTS, PAGE, SIZES, SPACING } from "./styles";

type CvContent = ApplicationOutputSuccess["cv_content"];

export async function renderCV(content: CvContent): Promise<Buffer> {
  const children: Paragraph[] = [];

  // 1. Name
  children.push(nameHeading(content.contact_details.full_name));

  // 2. Two contact lines, second one carries the bottom rule.
  const primaryContact = pipeJoin([
    content.contact_details.location,
    content.contact_details.email,
    content.contact_details.phone,
    content.contact_details.linkedin,
  ]);
  const secondaryContact = pipeJoin([
    content.contact_details.work_rights
      ? `Work Rights: ${content.contact_details.work_rights}`
      : null,
    content.contact_details.availability
      ? `Availability: ${content.contact_details.availability}`
      : null,
  ]);
  if (primaryContact) children.push(contactLine(primaryContact, false));
  if (secondaryContact) children.push(contactLine(secondaryContact, true));

  // 3. Profile
  children.push(sectionHeading("Profile"));
  children.push(bodyParagraph(content.profile));

  // 4. Technical Skills (omit entirely if empty)
  if (content.technical_skills.length > 0) {
    children.push(sectionHeading("Technical Skills"));
    for (const group of content.technical_skills) {
      children.push(
        new Paragraph({
          children: [
            boldPrefixRun(`${group.category}: `),
            plainRun(group.skills.join(", ")),
          ],
          spacing: {
            after: SPACING.paragraph_after,
            line: SPACING.line_115,
            lineRule: "auto",
          },
        }),
      );
    }
  }

  // 5. Professional Experience
  children.push(sectionHeading("Professional Experience"));
  for (const role of content.professional_experience) {
    children.push(
      roleHeader([
        new TextRun({
          text: `${role.role_title}, ${role.company}`,
          bold: true,
          font: FONTS.body,
          size: SIZES.body,
        }),
      ]),
    );
    const meta = pipeJoin([
      role.location,
      `${role.start_date} to ${role.end_date}`,
    ]);
    if (meta) children.push(metaLine(meta));
    for (const b of role.bullets) {
      children.push(bullet(b));
    }
  }

  // 6. Key Projects (omit entirely if empty)
  if (content.key_projects.length > 0) {
    children.push(sectionHeading("Key Projects"));
    for (const project of content.key_projects) {
      children.push(
        roleHeader([
          plainRun(project.name, { bold: true }),
          plainRun(" | "),
          plainRun(project.context, { italic: true }),
        ]),
      );
      for (const b of project.bullets) {
        children.push(bullet(b));
      }
      if (project.technologies.length > 0) {
        children.push(
          new Paragraph({
            children: [
              plainRun(`Technologies: ${project.technologies.join(", ")}`, {
                small: true,
                grey: true,
              }),
            ],
            spacing: {
              after: SPACING.paragraph_after,
              line: SPACING.line_115,
              lineRule: "auto",
            },
          }),
        );
      }
    }
  }

  // 7. Education
  children.push(sectionHeading("Education"));
  for (const edu of content.education) {
    children.push(
      roleHeader([
        plainRun(`${edu.qualification}, ${edu.institution}`, { bold: true }),
      ]),
    );
    const meta = pipeJoin([edu.location, edu.dates]);
    if (meta) children.push(metaLine(meta));
    for (const detail of edu.details) {
      children.push(bullet(detail));
    }
  }

  // 8. Leadership and Interests (omit entirely if empty)
  if (content.leadership_and_interests.length > 0) {
    children.push(sectionHeading("Leadership and Interests"));
    for (const item of content.leadership_and_interests) {
      children.push(
        new Paragraph({
          children: [
            boldPrefixRun(`${item.title}: `),
            plainRun(item.description),
          ],
          spacing: {
            after: SPACING.paragraph_after,
            line: SPACING.line_115,
            lineRule: "auto",
          },
        }),
      );
    }
  }

  // 9. Referees
  children.push(sectionHeading("Referees"));
  children.push(bodyParagraph(content.referees));

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
