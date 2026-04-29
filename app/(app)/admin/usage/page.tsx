// Admin usage page. Last 50 applications with status, attempt, cost,
// and duration; plus the running 7-day cost total. Direct Supabase
// reads via the service-role client — admin gating happens in the
// layout. Server Component: no client-side fetch.

import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_TONE: Record<string, string> = {
  success: "bg-success/15 text-success border-success/25",
  queued: "bg-info/15 text-info border-info/25",
  paused: "bg-warn/15 text-warn border-warn/25",
  running: "bg-warn/15 text-warn border-warn/25",
  rendering: "bg-warn/15 text-warn border-warn/25",
  insufficient_input: "bg-warn/15 text-warn border-warn/25",
  abandoned: "bg-dim/15 text-muted-foreground border-border",
  cancelled: "bg-dim/15 text-muted-foreground border-border",
  error: "bg-danger/15 text-danger border-danger/25",
};

function durationMs(started: string | null, completed: string | null): number | null {
  if (!started || !completed) return null;
  return new Date(completed).getTime() - new Date(started).getTime();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export default async function AdminUsagePage() {
  const service = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const [recentApps, recentUsage, perAppCost] = await Promise.all([
    service
      .from("applications")
      .select(
        "id, user_id, status, attempt_number, created_at, started_at, completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("token_usage")
      .select("cost_usd")
      .gte("created_at", sevenDaysAgo),
    service
      .from("token_usage")
      .select("application_id, cost_usd"),
  ]);

  const sevenDayCost = (recentUsage.data ?? []).reduce(
    (sum, r) => sum + Number(r.cost_usd ?? 0),
    0,
  );

  const costByApp = new Map<string, number>();
  for (const row of perAppCost.data ?? []) {
    if (!row.application_id) continue;
    costByApp.set(
      row.application_id,
      (costByApp.get(row.application_id) ?? 0) + Number(row.cost_usd ?? 0),
    );
  }

  const apps = recentApps.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 50 applications and the 7-day spend.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="7-day spend" value={`$${sevenDayCost.toFixed(2)}`} />
        <Stat label="Recent count" value={String(apps.length)} />
        <Stat
          label="Active in queue"
          value={String(
            apps.filter((a) =>
              ["queued", "paused", "running", "rendering"].includes(a.status),
            ).length,
          )}
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-dark3">
        <table className="w-full text-sm">
          <thead className="bg-dark2 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No applications yet.
                </td>
              </tr>
            )}
            {apps.map((row) => {
              const cost = costByApp.get(row.id) ?? 0;
              const tone =
                STATUS_TONE[row.status] ??
                "bg-dim/15 text-muted-foreground border-border";
              return (
                <tr
                  key={row.id}
                  className="border-t border-border text-text/90"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("en-NZ", {
                      timeZone: "Pacific/Auckland",
                    })}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.user_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{row.attempt_number}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {formatDuration(durationMs(row.started_at, row.completed_at))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    ${cost.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-dark3 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}
