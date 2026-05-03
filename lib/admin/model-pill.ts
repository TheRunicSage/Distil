// Display helpers for the LLM `model` value stored on token_usage
// rows. Surfaces a short human-friendly label and a colour tone for
// the per-provider chips on the admin Usage and Telemetry pages.
//
// Anthropic uses orange (matches the brand-orange accent used
// elsewhere). DeepSeek uses violet so the two providers are visibly
// distinct in the per-row table without needing to read the model
// string.

export type ModelLabel = {
  label: string;
  short: string;
  tone: string;
  provider: "anthropic" | "deepseek" | "unknown";
};

export function modelLabel(model: string | null | undefined): ModelLabel {
  if (!model) {
    return {
      label: "Unknown",
      short: "?",
      tone: "bg-dim/15 text-muted-foreground border-border",
      provider: "unknown",
    };
  }
  if (model === "claude-sonnet-4-6") {
    return {
      label: "Anthropic Sonnet 4.6",
      short: "Sonnet 4.6",
      tone: "bg-[var(--color-orange-subtle)] text-orange border-orange/30",
      provider: "anthropic",
    };
  }
  if (model === "deepseek-v4-pro") {
    return {
      label: "DeepSeek V4 Pro",
      short: "V4 Pro",
      tone: "bg-info/15 text-info border-info/30",
      provider: "deepseek",
    };
  }
  if (model === "deepseek-v4-flash") {
    return {
      label: "DeepSeek V4 Flash",
      short: "V4 Flash",
      tone: "bg-info/10 text-info border-info/25",
      provider: "deepseek",
    };
  }
  return {
    label: model,
    short: model,
    tone: "bg-dim/15 text-muted-foreground border-border",
    provider: "unknown",
  };
}
