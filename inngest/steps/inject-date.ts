// Inject-date: replaces the LLM's `{{TODAY}}` placeholder in
// cover_letter_content.header.date with today's date in Pacific/Auckland
// formatted "26 April 2026" (NZ format, full month name). The LLM has
// no reliable knowledge of today's date so we never trust its output
// for it. Pure: input validated output, output the same shape.

import { formatInTimeZone } from "date-fns-tz";
import type { ApplicationOutputSuccess } from "@/lib/llm/output-schema";

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
  return {
    ...output,
    cover_letter_content: {
      ...output.cover_letter_content,
      header: {
        ...output.cover_letter_content.header,
        date: today,
      },
    },
  };
}
