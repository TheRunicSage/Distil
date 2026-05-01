// Admin usage page. Last 50 applications with status, attempt, cost,
// and duration; plus the running 7-day cost total. Status filter via
// `?status=` search param so admin can pin a triage view via URL.

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const ALL_STATUSES = [
  "queued",
  "paused",
  "running",
  "rendering",
  "success",
  "insufficient_input",
  "abandoned",
  "cancelled",
  "error",
] as const;

const STATUS_GROUPS: {
  key: string;
  label: string;
  match: (s: string) => boolean;
}[] = [
  { key: "all", label: "All", match: () => true },
  {
    key: "active",
    label: "In progress",
    match: (s) => ["queued", "paused", "running", "rendering"].includes(s),
  },
  { key: "success", label: "Success", match: (s) => s === "success" },
  {
    key: "needs_input",
    label: "Needs input",
    match: (s) => s === "insufficient_input",
  },
  { key: "error", label: "Errored", match: (s) => s === "error" },
  {
    key: "stopped",
    label: "Stopped",
    match: (s) => s === "abandoned" || s === "cancelled",
  },
];

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

function durationMs(
  started: string | null,
  completed: string | null,
): number | null {
  if (!started || !completed) return null;
  return new Date(completed).getTime() - new Date(started).getTime();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const activeKey = sp.status ?? "all";
  const activeGroup =
    STATUS_GROUPS.find((g) => g.key === activeKey) ?? STATUS_GROUPS[0];

  const service = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  let appQuery = service
    .from("applications")
    .select(
      "id, user_id, status, attempt_number, created_at, started_at, completed_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  // Push the filter into the SQL query so we don't pull 50 rows just
  // to throw most away when an admin pins a specific status.
  if (activeGroup.key !== "all") {
    const matchedStatuses = ALL_STATUSES.filter((s) => activeGroup.match(s));
    appQuery = appQuery.in("status", matchedStatuses as unknown as string[]);
  }

  const [recentApps, recentUsage, perAppCost] = await Promise.all([
    appQuery,
    service.from("token_usage").select("cost_usd").gte("created_at", sevenDaysAgo),
    service.from("token_usage").select("application_id, cost_usd"),
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

      <nav className="flex flex-wrap gap-1.5">
        {STATUS_GROUPS.map((g) => {
          const active = g.key === activeGroup.key;
          const href = g.key === "all" ? "/admin/usage" : `/admin/usage?status=${g.key}`;
          return (
            <Link
              key={g.key}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-orange/60 bg-[var(--color-orange-subtle)] text-orange"
                  : "border-border bg-dark2/60 text-muted-foreground hover:border-orange/40 hover:text-text"
              }`}
            >
              {g.label}
            </Link>
          );
        })}
      </nav>

      <section className="overflow-x-auto rounded-lg border border-border bg-dark3">
        <table className="w-full table-auto text-sm">
          <thead className="bg-dark2 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-3 py-3">Created</th>
              <th className="whitespace-nowrap px-3 py-3">Application</th>
              <th className="hidden whitespace-nowrap px-3 py-3 lg:table-cell">User</th>
              <th className="whitespace-nowrap px-3 py-3">Status</th>
              <th className="hidden whitespace-nowrap px-3 py-3 sm:table-cell">Attempt</th>
              <th className="whitespace-nowrap px-3 py-3">Duration</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No applications match this filter.
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
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("en-NZ", {
                      timeZone: "Pacific/Auckland",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">
                    {row.id.slice(0, 8)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                    {row.user_id ? row.user_id.slice(0, 8) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-xs sm:table-cell">
                    {row.attempt_number}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    {formatDuration(durationMs(row.started_at, row.completed_at))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs text-text">
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
