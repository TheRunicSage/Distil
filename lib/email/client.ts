// Resend wrapper. Thin layer around the Resend SDK with two guarantees:
//
//   1. Env vars are read at call time (not module scope) so the
//      kill-switch convention (Decision Log [3]) and any mid-deploy env
//      change take effect on the next invocation.
//   2. Non-2xx responses throw `ApiError('email_send_failed')` so the
//      caller doesn't have to translate provider errors into our error
//      vocabulary.
//
// The function signature is deliberately small: subject, html, text, to,
// attachments. The renderApplicationEmail template builder in
// templates.ts produces the html/text/subject; the route or pipeline
// step fetches the DOCX bytes from Supabase Storage and supplies the
// attachments array.

import { Resend } from "resend";
import { ApiError } from "@/lib/errors/api-error";

export type EmailAttachment = {
  filename: string;
  // Base64-encoded content. Resend's API expects a string here; we
  // convert from Buffer at the call site via Buffer.from(bytes).toString("base64").
  content: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;

  if (!apiKey || !from) {
    // Misconfigured environment — treat as email_send_failed so the
    // caller's failure path still fires (telemetry + user toast).
    // Sentry will pick up the cause via the wrapping log.
    throw new ApiError(
      "email_send_failed",
      "Email is not configured (missing RESEND_API_KEY or EMAIL_FROM_ADDRESS).",
    );
  }

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments,
  });

  if (result.error) {
    throw new ApiError(
      "email_send_failed",
      `Resend error: ${result.error.message}`,
    );
  }
}
