// Zod-validated environment reader. Public env is validated everywhere;
// server-only env is validated only on the server so client bundles don't
// fail. Kill-switch and daily-ceiling vars are read at request time per
// app_handoff_v8.md §7.1 — not module scope — so flipping them in Vercel
// takes effect without redeploy.

import { z } from "zod";

const isServer = typeof window === "undefined";
const isProd = process.env.NODE_ENV === "production";

// ---------- Public (browser-readable) ----------

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

// ---------- Server-only ----------

// LLM_PROVIDER drives which provider keys are required. Anthropic is the
// historic default and remains the rollback target during the DeepSeek
// migration; DeepSeek requires both DEEPSEEK_API_KEY and TAVILY_API_KEY
// because DeepSeek has no server-side web search. Read once at module
// load for env validation; the runtime read happens via getLlmProvider()
// below so a Vercel toggle takes effect without redeploy.
const llmProviderRaw = (process.env.LLM_PROVIDER ?? "anthropic")
  .trim()
  .toLowerCase();
const requireDeepseek = llmProviderRaw === "deepseek";
const requireAnthropic = llmProviderRaw === "anthropic";

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Anthropic key required only when running on the Anthropic provider.
  // We allow it to be empty when LLM_PROVIDER=deepseek so a DeepSeek-only
  // deployment doesn't need to carry an unused key.
  ANTHROPIC_API_KEY: requireAnthropic ? z.string().min(1) : z.string().optional(),
  // DeepSeek + Tavily keys, required only when LLM_PROVIDER=deepseek.
  DEEPSEEK_API_KEY: requireDeepseek ? z.string().min(1) : z.string().optional(),
  TAVILY_API_KEY: requireDeepseek ? z.string().min(1) : z.string().optional(),
  // Inngest keys are required in production (Inngest cloud) and optional in
  // dev (the local Inngest dev server doesn't need them).
  INNGEST_EVENT_KEY: isProd ? z.string().min(1) : z.string().optional(),
  INNGEST_SIGNING_KEY: isProd ? z.string().min(1) : z.string().optional(),
  // Email is deferred per v7; the keys can be empty.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  // Sentry build-time vars; only meaningful when uploading source maps.
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  SLACK_WEBHOOK_URL: z.union([z.string().url(), z.literal("")]).optional(),
});

function fail(prefix: string, errors: z.ZodError): never {
  const lines = errors.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `  - ${path}: ${issue.message}`;
  });
  throw new Error(
    `${prefix}\n${lines.join("\n")}\n\n` +
      `Copy .env.example to .env.local and fill in the missing values.`,
  );
}

const publicParsed = PublicEnvSchema.safeParse(process.env);
if (!publicParsed.success) {
  fail("Invalid public environment variables:", publicParsed.error);
}

let serverParsedData: z.infer<typeof ServerEnvSchema> | null = null;
if (isServer) {
  const serverParsed = ServerEnvSchema.safeParse(process.env);
  if (!serverParsed.success) {
    fail("Invalid server environment variables:", serverParsed.error);
  }
  serverParsedData = serverParsed.data;
}

export const env = {
  ...publicParsed.data,
  ...(serverParsedData ?? ({} as z.infer<typeof ServerEnvSchema>)),
};

// ---------- Runtime-read flags (kill switch + daily ceiling) ----------

// Both default to spec values when unset. Read every call so toggling in
// Vercel takes effect without redeploy. Spec lives in app_handoff §7.6.

export function isGenerationEnabled(): boolean {
  const raw = process.env.GENERATION_ENABLED;
  if (raw === undefined) return true;
  return raw.toLowerCase() !== "false";
}

export function getDailyCostCeilingUsd(): number {
  const raw = process.env.DAILY_COST_CEILING_USD;
  if (raw === undefined || raw === "") return 10.0;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 10.0;
}

// Read at runtime per the same convention as the kill switch + daily
// ceiling: a Vercel env-var toggle (anthropic ↔ deepseek) takes effect
// on the next request without redeploy, so rollback during the DeepSeek
// migration is a UI flip, not a code change. Anything other than the
// literal "deepseek" falls back to the Anthropic default.
export type LlmProviderName = "anthropic" | "deepseek";

export function getLlmProvider(): LlmProviderName {
  const raw = (process.env.LLM_PROVIDER ?? "anthropic").trim().toLowerCase();
  return raw === "deepseek" ? "deepseek" : "anthropic";
}
