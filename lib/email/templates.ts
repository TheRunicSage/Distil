// Email template builder for the "tailored CV + cover letter ready"
// message. Produces subject + plaintext + HTML in one call.
//
// Graceful-fallback rule (DP-5 follow-up, 2026-05-11):
// real generations marked `success` may still emit a generic
// `role_archetype` or fall back to the company-name placeholder when
// the JD was thin but not gibberish enough to trigger
// `insufficient_input`. The template must never render bracket
// placeholders or empty values that read as broken software. Helpers
// below substitute readable copy when fields are missing/empty.

type RenderInput = {
  recipientName: string | null | undefined;
  role: string | null | undefined;
  company: string | null | undefined;
};

type RenderOutput = {
  subject: string;
  html: string;
  text: string;
};

// Trim + treat blank / placeholder-bracket strings as empty.
function clean(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "[]" || trimmed === "—") return "";
  return trimmed;
}

function firstName(fullName: string): string {
  const cleaned = clean(fullName);
  if (!cleaned) return "";
  return cleaned.split(/\s+/)[0] ?? "";
}

export function renderApplicationEmail(input: RenderInput): RenderOutput {
  const role = clean(input.role);
  const company = clean(input.company);
  const greetingName = firstName(input.recipientName ?? "");

  // Subject: company is the most identifying piece. Falls back to a
  // generic title if absent.
  const subject = company
    ? `Your tailored CV and cover letter — ${company}`
    : `Your tailored CV and cover letter`;

  // Salutation degrades to a neutral "Hi there" when we don't know the
  // first name. Avoids `Hi ,`.
  const greeting = greetingName ? `Hi ${greetingName},` : `Hi there,`;

  // Lead sentence: prefers "the {role} role at {company}", falls
  // through to "your role" when both are missing. Never "the  role at ".
  const leadSentence = (() => {
    if (role && company) return `Attached are the tailored documents for the ${role} role at ${company}.`;
    if (role) return `Attached are the tailored documents for the ${role} role.`;
    if (company) return `Attached are the tailored documents for your application at ${company}.`;
    return `Attached are your tailored documents.`;
  })();

  const sentTimeNote =
    `These documents are also available in your Distil account for 60 days after generation.`;

  const closing = `Best,\nThe Distil team\nCuriosum.ai`;

  const text = [
    greeting,
    "",
    leadSentence,
    "",
    sentTimeNote,
    "",
    closing,
  ].join("\n");

  // HTML mirrors the plaintext content with brand orange as the only
  // colour accent. No images, no external CSS — keeps inboxes happy.
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f3ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:'Georgia',serif;font-size:28px;font-weight:300;letter-spacing:-0.01em;color:#1a1a1a;">
      Distil
      <span style="display:inline-block;margin-left:8px;font-family:-apple-system,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#e2613b;vertical-align:middle;">Curiosum.ai</span>
    </div>
    <div style="height:1px;background:#e2613b;opacity:0.5;margin:20px 0 28px 0;"></div>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;">${escapeHtml(leadSentence)}</p>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.55;color:#5a5851;">${escapeHtml(sentTimeNote)}</p>
    <p style="margin:0;font-size:14px;line-height:1.55;color:#1a1a1a;">
      Best,<br/>
      The Distil team<br/>
      <span style="color:#5a5851;">Curiosum.ai</span>
    </p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
