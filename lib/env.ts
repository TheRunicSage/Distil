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

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
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
