// Inject-date + sanitise: post-processes the validated LLM output
// before it reaches the docx renderer.
//
// 1. Replaces the LLM's `{{TODAY}}` placeholder in
//    cover_letter_content.header.date with today's date in UTC,
//    formatted "8 May 2026". The LLM has no reliable knowledge of
//    today's date so we never trust its output for it.
// 2. Strips em / en dashes from rendered fields (system prompt §2.2
//    bans them but the model regularly emits them anyway). See
//    sanitise-output.ts for the full replacement policy.
//
// Pure: input validated output, output the same shape. The Inngest
// step name stays "inject-date" for backwards-compat with logs and
// SSE phases; the body now does both jobs.
//
// 2026-05-08: timezone switched from Pacific/Auckland to UTC alongside
// the §8 region-detection rewrite. The cover-letter date carries no
// location semantics — it's "the day the letter was written", not
// "the date in the employer's timezone". UTC is the simplest
// universal answer and ages well as the system handles non-NZ
// generations. See CLAUDE.md Decision Log [18] (2026-05-08).

import { formatInTimeZone } from "date-fns-tz";
import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";
import { sanitiseOutput } from "@/lib/llm/sanitise-output";

const DATE_TZ = "UTC";
const DATE_FORMAT = "d MMMM yyyy";

export function todayString(now: Date = new Date()): string {
  return formatInTimeZone(now, DATE_TZ, DATE_FORMAT);
}

// Backwards-compat alias for any caller that still imports the old
// name. Drop when no callers remain.
export const nzTodayString = todayString;

export function injectDate(
  output: ApplicationOutputSuccess,
  now: Date = new Date(),
): ApplicationOutputSuccess {
  const today = todayString(now);
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
