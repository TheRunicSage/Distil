// Admin usage page. Last 50 applications with status, attempt, cost,
// and duration; plus a cost total that windows by `?range=` (default
// 7 days, options month / quarter / year / forever). Status filter
// via `?status=` composes with range so an admin can pin a triage
// view via URL.

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { userPillLabel, userPillTone } from "@/lib/admin/user-pill";
import { modelLabel } from "@/lib/admin/model-pill";
import { getLlmProvider } from "@/lib/env";

export const dynamic = "force-dynamic";

// Spend window options. `days: null` means no lower bound (forever).
// `headline` is used in the section + stat labels; `pill` is the nav
// chip text. Default range is "7d" — keys map to the `?range=` param.
const RANGE_OPTIONS = [
  { key: "7d", days: 7, pill: "7 days", headline: "7-day" },
  { key: "30d", days: 30, pill: "Month", headline: "Month" },
  { key: "90d", days: 90, pill: "Quarter", headline: "Quarter" },
  { key: "365d", days: 365, pill: "Year", headline: "Year" },
  { key: "all", days: null, pill: "Forever", headline: "All-time" },
] as const;

function resolveRange(key: string | undefined) {
  return RANGE_OPTIONS.find((r) => r.key === key) ?? RANGE_OPTIONS[0];
}

// Compose the page URL from the two filter dimensions. Defaults
// (range=7d, status=all) are omitted from the query string so the
// "clean" URL stays /admin/usage.
function buildHref({
  range,
  status,
}: {
  range: string;
  status: string;
}): string {
  const params = new URLSearchParams();
  if (range && range !== "7d") params.set("range", range);
  if (status && status !== "all") params.set("status", status);
  const qs = params.toString();
  return qs ? `/admin/usage?${qs}` : "/admin/usage";
}

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

// Per-status palette. Previously every "in-flight" state (paused,
// running, rendering, insufficient_input) shared the same warn-amber
// pill, making the table impossible to scan. Each state now gets a
// distinct theme-aligned colour so the admin can read status by hue
// before reading the label:
//   success            → green     (terminal happy path)
//   queued             → cyan      (waiting, not yet started)
//   paused             → amber     (legacy state; sweeping to cancel)
//   running            → orange    (the LLM call is in progress)
//   rendering          → violet    (post-call doc render)
//   insufficient_input → brand     (needs your attention — same hue
//                                   we use for primary CTAs because
//                                   it's the only state the user can
//                                   act on)
//   abandoned          → muted     (terminal-quiet)
//   cancelled          → rose      (terminal-quiet but distinct from
//                                   abandoned so triage can tell them
//                                   apart at a glance)
//   error              → danger    (terminal-bad)
const STATUS_TONE: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  queued: "bg-info/15 text-info border-info/30",
  paused: "bg-warn/15 text-warn border-warn/30",
  running: "bg-orange/15 text-orange border-orange/40",
  rendering: "bg-innovation/15 text-innovation border-innovation/30",
  insufficient_input:
    "bg-[var(--color-orange-subtle)] text-orange border-orange/40",
  abandoned: "bg-dim/15 text-muted-foreground border-border",
  cancelled: "bg-rose/15 text-rose border-rose/30",
  error: "bg-danger/15 text-danger border-danger/30",
};

// Cost intensity. Lets the admin spot expensive runs without reading
// every row. Bands chosen against typical generation cost ($0.05
// average post-DeepSeek migration); anything above $0.50 is the
// historical Anthropic-with-cache ceiling and warrants attention.
function costTone(cost: number): string {
  if (cost === 0) return "text-muted-foreground";
  if (cost < 0.05) return "text-success";
  if (cost < 0.2) return "text-text";
  if (cost < 0.5) return "text-warn";
  return "text-danger font-bold";
}

// Duration intensity. Sub-second is queue-cycling noise (greyed),
// >5min usually means stuck-running (red). Most healthy generations
// land in the 60–180s band.
function durationTone(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 1000) return "text-muted-foreground";
  if (ms < 30_000) return "text-success";
  if (ms < 120_000) return "text-text";
  if (ms < 300_000) return "text-warn";
  return "text-danger font-bold";
}

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
  searchParams: Promise<{ status?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const activeKey = sp.status ?? "all";
  const activeGroup =
    STATUS_GROUPS.find((g) => g.key === activeKey) ?? STATUS_GROUPS[0];
  const activeRange = resolveRange(sp.range);

  const service = createServiceClient();
  const sinceIso =
    activeRange.days === null
      ? null
      : new Date(Date.now() - activeRange.days * 24 * 60 * 60 * 1000).toISOString();

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

  // Spend query is range-windowed. The default "7d" matches the prior
  // behaviour exactly; "all" drops the .gte() so we sum the full table.
  let usageQuery = service.from("token_usage").select("cost_usd, model");
  if (sinceIso) usageQuery = usageQuery.gte("created_at", sinceIso);

  const [recentApps, rangeUsage, perAppCost] = await Promise.all([
    appQuery,
    usageQuery,
    service.from("token_usage").select("application_id, cost_usd, model"),
  ]);

  const rangeCost = (rangeUsage.data ?? []).reduce(
    (sum, r) => sum + Number(r.cost_usd ?? 0),
    0,
  );

  // Per-provider spend split for the same window — admin can see at a
  // glance how the active range's spend breaks down between providers
  // without leaving the page.
  const rangeByProvider = { anthropic: 0, deepseek: 0, unknown: 0 };
  for (const row of rangeUsage.data ?? []) {
    const tag = modelLabel(row.model).provider;
    rangeByProvider[tag] += Number(row.cost_usd ?? 0);
  }

  const costByApp = new Map<string, number>();
  const modelByApp = new Map<string, string>();
  for (const row of perAppCost.data ?? []) {
    if (!row.application_id) continue;
    costByApp.set(
      row.application_id,
      (costByApp.get(row.application_id) ?? 0) + Number(row.cost_usd ?? 0),
    );
    if (row.model) {
      // If a single application has multiple token_usage rows from
      // different models (shouldn't happen in v1, but possible if the
      // env var was flipped mid-retry), the last one wins. Mark with
      // a "+" suffix so the admin spots it.
      const existing = modelByApp.get(row.application_id);
      if (existing && existing !== row.model) {
        modelByApp.set(row.application_id, `${row.model}+`);
      } else {
        modelByApp.set(row.application_id, row.model);
      }
    }
  }

  const apps = recentApps.data ?? [];
  const activeProvider = getLlmProvider();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-text">Usage</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Last 50 applications and the {activeRange.headline.toLowerCase()} spend.
        </p>
      </div>

      {/* Range nav — controls the spend stat + provider split below.
          Composes with the status filter: clicking a range preserves
          the active status query and vice versa. */}
      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label="Spend range"
      >
        <span className="mr-1 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Range
        </span>
        {RANGE_OPTIONS.map((r) => {
          const active = r.key === activeRange.key;
          const href = buildHref({
            range: r.key,
            status: activeGroup.key,
          });
          return (
            <Link
              key={r.key}
              href={href}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-orange/60 bg-[var(--color-orange-subtle)] text-orange"
                  : "border-border bg-dark2/60 text-muted-foreground hover:border-orange/40 hover:text-text"
              }`}
            >
              {r.pill}
            </Link>
          );
        })}
      </nav>

      {(() => {
        const activeQueueCount = apps.filter((a) =>
          ["queued", "paused", "running", "rendering"].includes(a.status),
        ).length;
        return (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={`${activeRange.headline} spend`}
              value={`$${rangeCost.toFixed(2)}`}
              tone="orange"
              labelTone="orange"
            />
            <Stat
              label="Active provider"
              value={activeProvider === "deepseek" ? "DeepSeek" : "Anthropic"}
              tone={activeProvider === "deepseek" ? "info" : "orange"}
              labelTone="cyan"
            />
            <Stat
              label="Recent count"
              value={String(apps.length)}
              tone="text"
              labelTone="cyan"
            />
            <Stat
              label="Active in queue"
              value={String(activeQueueCount)}
              tone={activeQueueCount > 0 ? "warn" : "muted"}
              labelTone="warn"
            />
          </section>
        );
      })()}

      <section className="panel p-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-orange">
          {activeRange.headline} spend by provider
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ProviderSpend
            label="Anthropic"
            cost={rangeByProvider.anthropic}
            total={rangeCost}
            rangeHeadline={activeRange.headline}
            tone="orange"
          />
          <ProviderSpend
            label="DeepSeek"
            cost={rangeByProvider.deepseek}
            total={rangeCost}
            rangeHeadline={activeRange.headline}
            tone="info"
          />
          {rangeByProvider.unknown > 0 && (
            <ProviderSpend
              label="Unknown"
              cost={rangeByProvider.unknown}
              total={rangeCost}
              rangeHeadline={activeRange.headline}
              tone="muted"
            />
          )}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUS_GROUPS.map((g) => {
          const active = g.key === activeGroup.key;
          const href = buildHref({
            range: activeRange.key,
            status: g.key,
          });
          return (
            <Link
              key={g.key}
              href={href}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
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

      <section className="panel overflow-x-auto">
        <table className="w-full table-auto text-base">
          <thead className="bg-dark2 text-left text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-3 py-3.5">Created</th>
              <th className="whitespace-nowrap px-3 py-3.5">Application</th>
              <th className="hidden whitespace-nowrap px-3 py-3.5 lg:table-cell">User</th>
              <th className="whitespace-nowrap px-3 py-3.5">Status</th>
              <th className="hidden whitespace-nowrap px-3 py-3.5 sm:table-cell">Attempt</th>
              <th className="hidden whitespace-nowrap px-3 py-3.5 md:table-cell">Model</th>
              <th className="whitespace-nowrap px-3 py-3.5">Duration</th>
              <th className="whitespace-nowrap px-3 py-3.5 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr>
                <td
                  colSpan={8}
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
                  <td className="whitespace-nowrap px-3 py-4 text-base text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("en-NZ", {
                      timeZone: "Pacific/Auckland",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-base">
                    {row.id.slice(0, 8)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-4 lg:table-cell">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-0.5 font-mono text-xs font-semibold ${userPillTone(row.user_id)}`}
                    >
                      {userPillLabel(row.user_id)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-bold uppercase tracking-[0.06em] ${tone}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-4 text-base sm:table-cell">
                    {row.attempt_number}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-4 md:table-cell">
                    {(() => {
                      const raw = modelByApp.get(row.id) ?? null;
                      const drift = raw?.endsWith("+");
                      const model = drift ? raw!.slice(0, -1) : raw;
                      const m = modelLabel(model);
                      return model ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${m.tone}`}
                          title={drift ? `${m.label} (mixed across attempts)` : m.label}
                        >
                          {m.short}
                          {drift ? "+" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      );
                    })()}
                  </td>
                  {(() => {
                    const ms = durationMs(row.started_at, row.completed_at);
                    return (
                      <td
                        className={`whitespace-nowrap px-3 py-4 text-base font-mono ${durationTone(ms)}`}
                      >
                        {formatDuration(ms)}
                      </td>
                    );
                  })()}
                  <td
                    className={`whitespace-nowrap px-3 py-4 text-right font-mono text-base ${costTone(cost)}`}
                  >
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

// Stat cards now carry an optional value tone + label tone so each
// card reads as its own thing in the row. Default keeps the previous
// behaviour for any caller that doesn't opt in.
type StatTone = "orange" | "cyan" | "info" | "warn" | "success" | "danger" | "innovation" | "text" | "muted";

const STAT_VALUE_CLASS: Record<StatTone, string> = {
  orange: "text-orange",
  cyan: "text-cyan",
  info: "text-info",
  warn: "text-warn",
  success: "text-success",
  danger: "text-danger",
  innovation: "text-innovation",
  text: "text-text",
  muted: "text-muted-foreground",
};
const STAT_LABEL_CLASS: Record<StatTone, string> = {
  orange: "text-orange",
  cyan: "text-cyan",
  info: "text-info",
  warn: "text-warn",
  success: "text-success",
  danger: "text-danger",
  innovation: "text-innovation",
  text: "text-text",
  muted: "text-muted-foreground",
};

function Stat({
  label,
  value,
  sub,
  tone = "text",
  labelTone = "orange",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  labelTone?: StatTone;
}) {
  return (
    <div className="panel p-5">
      <p
        className={`text-xs font-bold uppercase tracking-[0.16em] ${STAT_LABEL_CLASS[labelTone]}`}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums ${STAT_VALUE_CLASS[tone]}`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {sub}
        </p>
      )}
    </div>
  );
}

function ProviderSpend({
  label,
  cost,
  total,
  rangeHeadline,
  tone,
}: {
  label: string;
  cost: number;
  total: number;
  rangeHeadline: string;
  tone: "orange" | "info" | "muted";
}) {
  const pct = total > 0 ? (cost / total) * 100 : 0;
  const barColour =
    tone === "orange"
      ? "bg-orange"
      : tone === "info"
        ? "bg-info"
        : "bg-dim";
  const valueColour =
    tone === "orange"
      ? "text-orange"
      : tone === "info"
        ? "text-info"
        : "text-muted-foreground";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <span className={`font-mono text-base font-semibold ${valueColour}`}>
          ${cost.toFixed(2)}
        </span>
      </div>
      <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-dark4">
        <div
          className={`h-full rounded-full ${barColour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 font-mono text-sm text-muted-foreground">
        {pct.toFixed(0)}% of {rangeHeadline.toLowerCase()} spend
      </p>
    </div>
  );
}
