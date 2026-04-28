// Brand tokens as TypeScript constants.
// Mirrors app_handoff_v8.md §12.2 (colour) and §12.9 (identity).
// Use these only where Tailwind classes won't reach: DOCX accent
// colour, inline styles for HTML email, and JS-side string literals.

export const COLOURS = {
  // Core brand
  orange: "#E85A0E",
  orangeLight: "#FF7A35",
  orangeDim: "rgba(232,90,14,0.15)",

  // Dark theme (web app default)
  dark: "#0A0A09",
  dark2: "#111110",
  dark3: "#191917",
  dark4: "#252522",
  text: "#EEEDE6",
  muted: "rgba(238,237,230,0.5)",
  dim: "rgba(238,237,230,0.22)",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.13)",

  // Light theme (preview cards + email body only)
  lBg: "#FFFFFF",
  lSurface: "#F7F6F2",
  lText: "#111110",
  lMid: "#888880",
  lBorder: "#E8E7E0",

  // Semantic accents
  success: "#3EC87A",
  info: "#4B9FE8",
  warn: "#F0A030",
  innovation: "#8B7EE8",
  danger: "#FF4B6E",
} as const;

export const FONTS = {
  sans: '"DM Sans", Helvetica, Arial, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
} as const;

export const RADII = {
  sm: "6px",
  default: "10px",
  lg: "14px",
} as const;

// Curiosum identity constants — see app_handoff_v8.md §12.9.
// Use these strings rather than sprinkling literals across the codebase.
export const CURIOSUM_DOMAIN = "curiosum.ai";
export const CURIOSUM_WEBSITE = "https://curiosum.ai";
export const CURIOSUM_FOUNDER_EMAIL = "hamish@curiosum.ai";
export const CURIOSUM_FOUNDER_PHONE = "+64 21 717 310";
export const CURIOSUM_FOUNDER_NAME = "Hamish Carr";
export const CURIOSUM_FIRM_LONG = "Curiosum Management Consulting";
export const CURIOSUM_FIRM_SHORT = "Curiosum";
export const CURIOSUM_TAGLINE = "Think differently. Transform deliberately.";
export const EMAIL_FROM_DEFAULT = "applications@curiosum.ai";
