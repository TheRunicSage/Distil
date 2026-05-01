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
import {
  FONTS,
  PAGE,
  getSizesForSeniority,
  getSpacingForSeniority,
} from "./styles";

type CvContent = ApplicationOutputSuccess["cv_content"];
type Seniority = ApplicationOutputSuccess["jd_analysis"]["seniority"];

export async function renderCV(
  content: CvContent,
  seniority: Seniority,
): Promise<Buffer> {
  const spacing = getSpacingForSeniority(seniority);
  const sizes = getSizesForSeniority(seniority);
  const children: Paragraph[] = [];

  // 1. Name
  children.push(nameHeading(content.contact_details.full_name, spacing, sizes));

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
  if (primaryContact)
    children.push(contactLine(primaryContact, false, spacing, sizes));
  if (secondaryContact)
    children.push(contactLine(secondaryContact, true, spacing, sizes));

  // 3. Profile
  children.push(sectionHeading("Profile", spacing, sizes));
  children.push(bodyParagraph(content.profile, { spacing, sizes }));

  // 4. Technical Skills (omit entirely if empty)
  if (content.technical_skills.length > 0) {
    children.push(sectionHeading("Technical Skills", spacing, sizes));
    for (const group of content.technical_skills) {
      children.push(
        new Paragraph({
          children: [
            boldPrefixRun(`${group.category}: `, sizes),
            plainRun(group.skills.join(", "), { sizes }),
          ],
          spacing: {
            after: spacing.paragraph_after,
            line: spacing.line_115,
            lineRule: "auto",
          },
        }),
      );
    }
  }

  // 5. Professional Experience
  children.push(sectionHeading("Professional Experience", spacing, sizes));
  for (const role of content.professional_experience) {
    children.push(
      roleHeader(
        [
          new TextRun({
            text: `${role.role_title}, ${role.company}`,
            bold: true,
            font: FONTS.body,
            size: sizes.body,
          }),
        ],
        spacing,
      ),
    );
    const meta = pipeJoin([
      role.location,
      `${role.start_date} to ${role.end_date}`,
    ]);
    if (meta) children.push(metaLine(meta, spacing, sizes));
    for (const b of role.bullets) {
      children.push(bullet(b, spacing, sizes));
    }
  }

  // 6. Key Projects (omit entirely if empty)
  if (content.key_projects.length > 0) {
    children.push(sectionHeading("Key Projects", spacing, sizes));
    for (const project of content.key_projects) {
      children.push(
        roleHeader(
          [
            plainRun(project.name, { bold: true, sizes }),
            plainRun(" | ", { sizes }),
            plainRun(project.context, { italic: true, sizes }),
          ],
          spacing,
        ),
      );
      for (const b of project.bullets) {
        children.push(bullet(b, spacing, sizes));
      }
      if (project.technologies.length > 0) {
        children.push(
          new Paragraph({
            children: [
              plainRun(`Technologies: ${project.technologies.join(", ")}`, {
                small: true,
                grey: true,
                sizes,
              }),
            ],
            spacing: {
              after: spacing.paragraph_after,
              line: spacing.line_115,
              lineRule: "auto",
            },
          }),
        );
      }
    }
  }

  // 7. Education. Details render as a single inline line joined with " · "
  // (NOT bullets) — Education entries usually have 1-3 short details
  // (GPA, specialisation, thesis title) and rendering each as a bullet
  // wastes a full line of vertical space per item. Joining keeps the
  // section compact, which is the dominant lever for landing graduate /
  // mid CVs on 2 pages.
  children.push(sectionHeading("Education", spacing, sizes));
  for (const edu of content.education) {
    children.push(
      roleHeader(
        [
          plainRun(`${edu.qualification}, ${edu.institution}`, {
            bold: true,
            sizes,
          }),
        ],
        spacing,
      ),
    );
    const meta = pipeJoin([edu.location, edu.dates]);
    if (meta) children.push(metaLine(meta, spacing, sizes));
    if (edu.details.length > 0) {
      const joined = edu.details
        .map((d) => d.trim().replace(/[.\s]+$/, ""))
        .filter(Boolean)
        .join(" · ");
      if (joined) {
        children.push(bodyParagraph(joined, { spacing, sizes }));
      }
    }
  }

  // 8. Leadership and Interests (omit entirely if empty)
  if (content.leadership_and_interests.length > 0) {
    children.push(sectionHeading("Leadership and Interests", spacing, sizes));
    for (const item of content.leadership_and_interests) {
      children.push(
        new Paragraph({
          children: [
            boldPrefixRun(`${item.title}: `, sizes),
            plainRun(item.description, { sizes }),
          ],
          spacing: {
            after: spacing.paragraph_after,
            line: spacing.line_115,
            lineRule: "auto",
          },
        }),
      );
    }
  }

  // 9. Referees — rendered as a single small grey inline line at the
  // bottom (no separate section heading). NZ recruiters expect to see
  // the word "Referees" on the page, but the typical content is just
  // "Available on request" — a full section heading + body paragraph
  // burned ~3 lines of vertical space for one short line of text and
  // was the most common cause of CVs spilling onto a third page with
  // nothing else there. Using metaLine keeps the line ATS-greppable
  // ("Referees:" prefix is parsed as a section header equivalent) at a
  // fraction of the vertical cost.
  children.push(metaLine(`Referees: ${content.referees}`, spacing, sizes));

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
          run: { font: FONTS.body, size: sizes.body },
        },
      },
    },
    sections: [section],
  });

  return Packer.toBuffer(doc);
}
