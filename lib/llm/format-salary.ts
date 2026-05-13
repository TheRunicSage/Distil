// Salary range parser — collapses verbose model output into a pill-
// friendly midpoint figure. Triggered by the 2026-05-13 incident:
// DeepSeek emitted a long prose-shaped range that didn't fit the
// success-view pill. The model still emits whatever it wants into
// `salary_band.range` (schema cap 200 chars); we present a shorter
// midpoint at the chip and surface the full original on hover so no
// signal is lost.
//
// Behaviour:
//   - Parses the first two numeric tokens (with `k` / `K` / `m` / `M`
//     suffixes and `,` thousand separators) into min + max.
//   - Detects a leading currency code (NZD, AUD, USD, GBP, EUR, CAD,
//     SGD, etc.) or symbol ($, £, €, ¥). Falls back to no prefix
//     rather than guessing.
//   - Returns midpoint formatted with thousand separators.
//   - Returns the original string untouched if it can't extract two
//     numbers (e.g. "Negotiable", or a single-figure emission).
//
// Pure module; no I/O; safe in both server and client bundles. The
// success view imports it from a server component in (app)/application
// /[id]/page.tsx, but the same helper could be reused client-side
// without changes.

const CURRENCY_CODES = [
  "NZD",
  "AUD",
  "USD",
  "GBP",
  "EUR",
  "CAD",
  "SGD",
  "HKD",
  "JPY",
  "CNY",
  "INR",
  "ZAR",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "AED",
  "SAR",
] as const;
const CURRENCY_SYMBOLS = ["$", "£", "€", "¥", "₹"] as const;

const CURRENCY_PREFIX_PATTERN = new RegExp(
  // Optional whitespace, then either a 3-letter code (word-boundary
  // before it) or a symbol. Captures the matched token verbatim so
  // we can re-emit it on the midpoint.
  `\\b(${CURRENCY_CODES.join("|")})\\b|(${CURRENCY_SYMBOLS.map((s) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})`,
  "i",
);

// Captures: number (with comma/dot separators) + optional k/K/m/M
// suffix. The number itself is at least one digit; thousand
// separators allowed but a trailing decimal must have at least one
// fractional digit.
const NUMBER_PATTERN =
  /(\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.(\d+))?\s*([kKmM])?/g;

export type SalaryFormatResult = {
  // Midpoint display string — e.g. "NZD 110,000" or "$72k" or just
  // "110,000" if no currency was detectable. Falls back to the raw
  // range when parsing yields fewer than two numbers.
  display: string;
  // True when parsing succeeded and `display` carries the midpoint.
  // False when we couldn't extract two numbers — `display` is then
  // the original range string.
  isAverage: boolean;
};

export function formatSalaryAverage(rangeRaw: string): SalaryFormatResult {
  if (!rangeRaw || typeof rangeRaw !== "string") {
    return { display: rangeRaw ?? "", isAverage: false };
  }

  const range = rangeRaw.trim();
  if (range === "") return { display: "", isAverage: false };

  const numbers: number[] = [];
  const iter = range.matchAll(NUMBER_PATTERN);
  for (const m of iter) {
    const integerPart = m[1].replace(/[, ]/g, "");
    const fractionPart = m[2];
    const suffix = (m[3] ?? "").toLowerCase();
    let value = parseFloat(
      fractionPart ? `${integerPart}.${fractionPart}` : integerPart,
    );
    if (!Number.isFinite(value)) continue;
    if (suffix === "k") value *= 1_000;
    else if (suffix === "m") value *= 1_000_000;
    // Guard against tiny / huge accidents — drop anything below 1k
    // or above 100m. (Anything outside that window in a "salary
    // band" is almost certainly noise — a year, an ATS keyword
    // count, etc.)
    if (value < 1_000 || value > 100_000_000) continue;
    numbers.push(value);
    if (numbers.length >= 2) break;
  }

  if (numbers.length < 2) {
    return { display: range, isAverage: false };
  }

  const [a, b] = numbers;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const avg = Math.round((min + max) / 2);

  const currencyMatch = range.match(CURRENCY_PREFIX_PATTERN);
  const currencyToken =
    currencyMatch?.[1]?.toUpperCase() ?? currencyMatch?.[2] ?? null;

  // Round to a clean number — large salaries to the nearest thousand,
  // smaller to the nearest hundred. Keeps the pill compact without
  // implying false precision.
  const rounded = avg >= 100_000
    ? Math.round(avg / 1_000) * 1_000
    : avg >= 10_000
      ? Math.round(avg / 500) * 500
      : Math.round(avg / 100) * 100;

  const formatted = rounded.toLocaleString("en-NZ");

  let display: string;
  if (!currencyToken) {
    display = formatted;
  } else if (CURRENCY_CODES.includes(currencyToken as never)) {
    display = `${currencyToken} ${formatted}`;
  } else {
    display = `${currencyToken}${formatted}`;
  }

  return { display, isAverage: true };
}
