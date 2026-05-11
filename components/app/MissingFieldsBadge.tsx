// Small yellow-tinted chip with an exclamation icon. Hover (or keyboard
// focus) reveals a popover listing the missing fields with a soft
// reminder of what to do about it. Used at four touchpoints:
//
//   1. /dashboard topbar — quick glance, "your master CV is missing X"
//   2. /settings Master CV card — inline reminder where the user can act
//   3. /upload "Currently on file" panel — same moment they see the CV
//   4. /application/[id] success view — "this generation is missing X"
//
// Two variants share one primitive: parse-time (driven by
// master_cvs.missing_fields, set at upload by detectMissingFields()) and
// output-time (driven by cv_content.contact_details, computed per
// application from null fields + a single-word full_name heuristic).
//
// Pure CSS hover via group-hover utilities — no client JS, server-
// component compatible. Tabindex on the trigger keeps the popover
// reachable for keyboard users.

import { TriangleAlertIcon } from "lucide-react";
import {
  MISSING_FIELD_LABEL,
  type MissingFieldCode,
} from "@/lib/parsing/detect-missing-fields";

type Variant = "parse" | "output";

type Props = {
  fields: MissingFieldCode[];
  variant?: Variant;
  /** Override the default chip label, e.g. "Master CV · 2 missing". */
  label?: string;
  /** Extra Tailwind classes on the outer wrapper. */
  className?: string;
};

const VARIANT_COPY: Record<
  Variant,
  { headline: string; body: string }
> = {
  parse: {
    headline: "Heads up — your master CV is missing some details",
    body:
      "Tailored applications come out sharper when these are present. Either update your master CV and re-upload, or fill them into the downloaded docx before sending.",
  },
  output: {
    headline: "This generation is missing some details",
    body:
      "We left these blank because they weren't in your master CV. Adding them to your master CV would make future applications more complete; you can also fill them into the downloaded docx by hand.",
  },
};

export function MissingFieldsBadge({
  fields,
  variant = "parse",
  label,
  className = "",
}: Props) {
  if (fields.length === 0) return null;
  const copy = VARIANT_COPY[variant];
  const chipLabel =
    label ??
    `${fields.length} ${fields.length === 1 ? "detail" : "details"} missing`;

  return (
    <span
      tabIndex={0}
      role="note"
      aria-label={`${chipLabel}. ${copy.body}`}
      className={`group relative inline-flex outline-none ${className}`}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/15 px-3 py-0.5 text-xs font-semibold uppercase tracking-[0.06em] text-warn transition-colors group-hover:bg-warn/20 group-focus-visible:bg-warn/20"
      >
        <TriangleAlertIcon size={12} aria-hidden />
        {chipLabel}
      </span>
      {/* Popover — pure-CSS hover/focus reveal. Sits below the chip
          left-aligned, max-w-[20rem] so the body copy stays readable
          on narrow screens. z-50 so it floats above sibling cards
          even when parent FadeUps briefly establish a stacking
          context during reveal. */}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] translate-y-1 rounded-xl border border-warn/30 bg-dark4 p-4 text-left opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.28)] transition-[opacity,transform] duration-150 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
      >
        <p className="text-sm font-semibold text-text">{copy.headline}</p>
        <ul className="mt-3 space-y-1.5">
          {fields.map((f) => (
            <li
              key={f}
              className="flex items-baseline gap-2 text-sm text-text/85"
            >
              <span
                aria-hidden
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
              />
              <span>{MISSING_FIELD_LABEL[f]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {copy.body}
        </p>
      </span>
    </span>
  );
}

// Helper: compute the output-time variant's missing fields list from
// the parsed cv_content.contact_details. Used on the application
// success view. Returns the four nullable contact fields that came
// back null + a 'surname' code if full_name is a single token.
//
// Note: location is still required by schema (not nullable) so we
// don't check it here — if the model emits "New Zealand" as a fallback
// location for a fully-empty CV, that's fine; the renderer will print
// it and the parse-time badge already covered the original gap.
export function computeOutputMissingFields(contact: {
  full_name: string;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
}): MissingFieldCode[] {
  const out: MissingFieldCode[] = [];
  if (
    contact.full_name.trim().split(/\s+/).filter(Boolean).length < 2
  ) {
    out.push("surname");
  }
  if (!contact.phone) out.push("phone");
  if (!contact.email) out.push("email");
  if (!contact.linkedin) out.push("linkedin");
  return out;
}
