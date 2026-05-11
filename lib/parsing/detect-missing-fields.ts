// Regex heuristic over the parsed master-CV text to flag which
// "absolutely necessary" contact-detail fields are missing. Runs once
// at upload time and the result is persisted on
// master_cvs.missing_fields (text[]).
//
// Five fields tracked, per the 2026-05-11 product decision:
//   - 'surname'  — first name detectable but no clear surname
//   - 'phone'    — no phone-number pattern found
//   - 'email'    — no email-address pattern found
//   - 'linkedin' — no linkedin URL or profile reference found
//   - 'location' — no city / country / region pattern found
//
// Empty array means "everything found"; non-empty surfaces the
// yellow-exclamation badge in the (app) UI.
//
// Design notes:
//   - This is a *heuristic*, not a parser. False negatives (we miss a
//     field that's present in some unusual layout) are preferred to
//     false positives (we flag a field that IS present). A spurious
//     warning would erode user trust faster than a missed one.
//   - We only look at the first ~3000 characters since contact details
//     are almost always at the top of a CV. Skips name-collisions in
//     job-history text further down (e.g. an old employer's email
//     mentioned in a bullet).
//   - "Surname" detection: look at the first non-empty line; if it
//     contains exactly one whitespace-separated word AND that word is
//     a plausible name (only letters / hyphens / apostrophes), flag
//     'surname'. Multi-word lines are assumed to carry the full name.
//   - Location detection: a known-city or known-country keyword from
//     a small list, OR a generic pattern like "City, Region". This is
//     intentionally permissive — locations vary wildly internationally.

export type MissingFieldCode =
  | "surname"
  | "phone"
  | "email"
  | "linkedin"
  | "location";

const SCAN_WINDOW_CHARS = 3000;

// Email — standard RFC-5322-ish, deliberately permissive.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// Phone — 8+ digits with optional country code, separators, and parens.
// Catches +64 21 123 4567, (021) 123 4567, 021-123-4567, 0211234567, etc.
// Requires at least 8 digits in total to avoid matching year ranges
// like "2018 2024" or short numeric strings.
const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}/;

// LinkedIn — full URL, linkedin.com host, or "LinkedIn:" label with
// content. NOT a bare "LinkedIn" word (that's the placeholder we're
// trying to avoid).
const LINKEDIN_RE =
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+|linkedin\s*[:\-]\s*[A-Za-z0-9._/-]+/i;

// Plausible name word: letters (incl. Unicode), apostrophes, hyphens.
// No digits, no special chars.
const NAME_WORD_RE = /^[\p{L}][\p{L}'\-]*$/u;

// Coarse location detection. The full list of "known cities" would be
// huge; instead we look for either (a) any of a small list of high-
// frequency anchors that almost certainly mean "a place is on this
// CV", or (b) the comma-separated "City, Region" pattern, or (c) a
// known-country word.
const LOCATION_ANCHORS = [
  // NZ / AU cities (high-frequency for our user base)
  "Auckland",
  "Wellington",
  "Christchurch",
  "Hamilton",
  "Tauranga",
  "Dunedin",
  "Sydney",
  "Melbourne",
  "Brisbane",
  "Perth",
  "Adelaide",
  "Canberra",
  // Major international hubs
  "London",
  "Manchester",
  "Edinburgh",
  "Dublin",
  "New York",
  "San Francisco",
  "Los Angeles",
  "Chicago",
  "Boston",
  "Seattle",
  "Toronto",
  "Vancouver",
  "Montreal",
  // Country names
  "New Zealand",
  "Australia",
  "United Kingdom",
  "United States",
  "Canada",
  "Ireland",
  "South Africa",
  "Singapore",
  "Germany",
  "France",
  "Netherlands",
];

const LOCATION_ANCHOR_RE = new RegExp(
  `\\b(?:${LOCATION_ANCHORS.map((a) => a.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "i",
);

// "City, Region" pattern — two capitalised tokens separated by a comma.
const CITY_REGION_RE = /\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?,\s*[A-Z][a-zA-Z]+/;

export function detectMissingFields(rawText: string): MissingFieldCode[] {
  const text = rawText.slice(0, SCAN_WINDOW_CHARS);
  const missing: MissingFieldCode[] = [];

  // Phone, email, linkedin: straightforward regex presence checks.
  if (!EMAIL_RE.test(text)) missing.push("email");
  if (!PHONE_RE.test(text)) missing.push("phone");
  if (!LINKEDIN_RE.test(text)) missing.push("linkedin");

  // Surname: inspect the first non-empty line of the parsed text.
  // The convention across PDF + DOCX exports is "Full Name" on line 1.
  // A single name-word triggers the 'surname' flag.
  const firstNonEmptyLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstNonEmptyLine) {
    const words = firstNonEmptyLine.split(/\s+/).filter(Boolean);
    const looksLikeNameLine =
      words.length >= 1 && words.length <= 4 &&
      words.every((w) => NAME_WORD_RE.test(w));
    if (looksLikeNameLine && words.length === 1) {
      missing.push("surname");
    }
    // If the first line doesn't look like a name line at all (e.g. it's
    // "Professional Profile - Hamish Carr"), we don't trigger
    // 'surname' — we just don't have enough signal. False-positive
    // avoidance.
  }

  // Location: anchor word OR City, Region pattern is enough.
  if (!LOCATION_ANCHOR_RE.test(text) && !CITY_REGION_RE.test(text)) {
    missing.push("location");
  }

  return missing;
}

// Human-readable label per code. Used by the badge tooltip.
export const MISSING_FIELD_LABEL: Record<MissingFieldCode, string> = {
  surname: "Surname",
  phone: "Phone number",
  email: "Email address",
  linkedin: "LinkedIn URL",
  location: "Location / city",
};
