// Daily 09:00 NZT (21:00 UTC). Summarises the last 24 hours of
// applications + token spend and delivers it to the operator.
//
// Delivery (spec §7.6 Tier 2 #13):
//   1. If RESEND_API_KEY + ADMIN_EMAIL are set → send email via Resend.
//   2. Else if SLACK_WEBHOOK_URL is set → POST a Slack-formatted JSON.
//   3. Else log a warning to request_logs and exit (admin still has
//      the admin panel).

import "server-only";
import { env } from "@/lib/env";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type Summary = {
  windowStartIso: string;
  windowEndIso: string;
  totalSubmissions: number;
  byStatus: Record<string, number>;
  totalSpendUsd: number;
  topErrorCode: string | null;
  topErrorCount: number;
};

export const dailySummary = inngest.createFunction(
  {
    id: "daily-summary",
    name: "Daily Summary (09:00 NZT)",
    triggers: [{ cron: "0 21 * * *" }],
  },
  async () => {
    return withCronLog("daily-summary", async () => {
      const summary = await buildSummary();
      const delivered = await deliver(summary);
      return { delivered, ...summary };
    });
  },
);

async function buildSummary(): Promise<Summary> {
  const supabase = createServiceClient();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - ONE_DAY_MS);

  const [apps, usage, errors] = await Promise.all([
    supabase
      .from("applications")
      .select("status")
      .gte("created_at", windowStart.toISOString()),
    supabase
      .from("token_usage")
      .select("cost_usd")
      .gte("created_at", windowStart.toISOString()),
    supabase
      .from("request_logs")
      .select("error_code")
      .eq("status", "error")
      .gte("created_at", windowStart.toISOString()),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of apps.data ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }
  const totalSpendUsd = (usage.data ?? []).reduce(
    (sum, r) => sum + Number(r.cost_usd ?? 0),
    0,
  );

  const errorCounts: Record<string, number> = {};
  for (const row of errors.data ?? []) {
    if (!row.error_code) continue;
    errorCounts[row.error_code] = (errorCounts[row.error_code] ?? 0) + 1;
  }
  const topError = Object.entries(errorCounts).sort(
    (a, b) => b[1] - a[1],
  )[0];

  return {
    windowStartIso: windowStart.toISOString(),
    windowEndIso: windowEnd.toISOString(),
    totalSubmissions: apps.data?.length ?? 0,
    byStatus,
    totalSpendUsd: Number(totalSpendUsd.toFixed(4)),
    topErrorCode: topError?.[0] ?? null,
    topErrorCount: topError?.[1] ?? 0,
  };
}

async function deliver(s: Summary): Promise<"resend" | "slack" | "none"> {
  const lines = [
    "Distil daily summary",
    `${new Date(s.windowStartIso).toISOString().slice(0, 16)} → ${new Date(s.windowEndIso).toISOString().slice(0, 16)}`,
    "",
    `Submissions: ${s.totalSubmissions}`,
    `Spend: $${s.totalSpendUsd.toFixed(2)}`,
    "",
    "By status:",
    ...Object.entries(s.byStatus).map(([k, v]) => `  ${k}: ${v}`),
  ];
  if (s.topErrorCode) {
    lines.push("", `Top error: ${s.topErrorCode} (×${s.topErrorCount})`);
  }
  const text = lines.join("\n");

  if (env.RESEND_API_KEY && env.ADMIN_EMAIL && env.EMAIL_FROM_ADDRESS) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM_ADDRESS,
        to: env.ADMIN_EMAIL,
        subject: `Distil daily summary — ${s.totalSubmissions} runs, $${s.totalSpendUsd.toFixed(2)}`,
        text,
      }),
    });
    if (res.ok) return "resend";
  }

  if (env.SLACK_WEBHOOK_URL) {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "```\n" + text + "\n```" }),
    });
    if (res.ok) return "slack";
  }

  return "none";
}
