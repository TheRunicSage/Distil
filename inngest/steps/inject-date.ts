// Inject-date + sanitise: post-processes the validated LLM output
// before it reaches the docx renderer.
//
// 1. Replaces the LLM's `{{TODAY}}` placeholder in
//    cover_letter_content.header.date with today's date in
//    Pacific/Auckland formatted "26 April 2026". The LLM has no
//    reliable knowledge of today's date so we never trust its output
//    for it.
// 2. Strips em / en dashes from rendered fields (system prompt §2.2
//    bans them but the model regularly emits them anyway). See
//    sanitise-output.ts for the full replacement policy.
//
// Pure: input validated output, output the same shape. The Inngest
// step name stays "inject-date" for backwards-compat with logs and
// SSE phases; the body now does both jobs.

import { formatInTimeZone } from "date-fns-tz";
import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";
import { sanitiseOutput } from "@/lib/llm/sanitise-output";

const NZ_TZ = "Pacific/Auckland";
const NZ_DATE_FORMAT = "d MMMM yyyy";

export function nzTodayString(now: Date = new Date()): string {
  return formatInTimeZone(now, NZ_TZ, NZ_DATE_FORMAT);
}

export function injectDate(
  output: ApplicationOutputSuccess,
  now: Date = new Date(),
): ApplicationOutputSuccess {
  const today = nzTodayString(now);
  const dated: ApplicationOutputSuccess = {
    ...output,
    cover_letter_content: {
      ...output.cover_letter_content,
      header: {
        ...output.cover_letter_content.header,
        date: today,
      },
    },
  };
  return sanitiseOutput(dated);
}
