// Admin telemetry page. 7-day event counts grouped by event name,
// plus a small submission outcome funnel. Useful answer to "how many
// people made it through the funnel last week" without leaving the
// app.

import { createServiceClient } from "@/lib/supabase/service";
import { getLlmProvider } from "@/lib/env";
import { modelLabel } from "@/lib/admin/model-pill";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const FUNNEL_ORDER = [
  "application.submit.attempted",
  "application.submit.succeeded",
  "generation.started",
  "generation.llm_completed",
  "generation.finalized",
] as const;

export default async function AdminTelemetryPage() {
  const service = createServiceClient();
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const [{ data: telemetry }, { data: usage }] = await Promise.all([
    service
      .from("telemetry_events")
      .select("name, properties")
      .gte("created_at", since),
    service
      .from("token_usage")
      .select(
        "model, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, web_search_count",
      )
      .gte("created_at", since),
  ]);

  const counts: Record<string, number> = {};
  let outcomes = { success: 0, insufficient_input: 0, error: 0 };
  for (const row of telemetry ?? []) {
    counts[row.name] = (counts[row.name] ?? 0) + 1;
    if (row.name === "generation.finalized" && row.properties) {
      const outcome = (row.properties as { outcome?: string }).outcome;
      if (outcome === "success") outcomes.success += 1;
      else if (outcome === "insufficient_input")
        outcomes.insufficient_input += 1;
      else if (outcome === "error") outcomes.error += 1;
    }
  }

  // Per-model rollup over the same 7-day window. The migration's
  // primary observability question is "is the DeepSeek path actually
  // cheaper at parity?" — this section gives the answer at a glance.
  type ProviderStats = {
    model: string;
    calls: number;
    total_cost: number;
    total_input: number;
    total_output: number;
    total_cache_read: number;
    total_cache_write: number;
    total_searches: number;
  };
  const byModel = new Map<string, ProviderStats>();
  for (const row of usage ?? []) {
    const key = row.model ?? "unknown";
    let entry = byModel.get(key);
    if (!entry) {
      entry = {
        model: key,
        calls: 0,
        total_cost: 0,
        total_input: 0,
        total_output: 0,
        total_cache_read: 0,
        total_cache_write: 0,
        total_searches: 0,
      };
      byModel.set(key, entry);
    }
    entry.calls += 1;
    entry.total_cost += Number(row.cost_usd ?? 0);
    entry.total_input += Number(row.input_tokens ?? 0);
    entry.total_output += Number(row.output_tokens ?? 0);
    entry.total_cache_read += Number(row.cache_read_tokens ?? 0);
    entry.total_cache_write += Number(row.cache_creation_tokens ?? 0);
    entry.total_searches += Number(row.web_search_count ?? 0);
  }
  const providerStats = Array.from(byModel.values()).sort(
    (a, b) => b.total_cost - a.total_cost,
  );
  const grandTotal = providerStats.reduce((s, p) => s + p.total_cost, 0);
  const activeProvider = getLlmProvider();

  const funnelMax = Math.max(
    1,
    ...FUNNEL_ORDER.map((name) => counts[name] ?? 0),
  );

  const otherEvents = Object.entries(counts)
    .filter(([name]) => !FUNNEL_ORDER.includes(name as never))
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-text">Telemetry</h1>
        <p className="mt-2 text-base text-muted-foreground">
          7-day event counts. Trailing window from{" "}
          {new Date(since).toLocaleDateString("en-NZ", {
            timeZone: "Pacific/Auckland",
          })}
          .
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Successes" value={String(outcomes.success)} accent="success" />
        <Stat
          label="Insufficient input"
          value={String(outcomes.insufficient_input)}
          accent="warn"
        />
        <Stat label="Errors" value={String(outcomes.error)} accent="danger" />
      </section>

      <section className="panel p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-orange">
            LLM spend by provider (7 days)
          </h2>
          <span className="font-mono text-base text-muted-foreground">
            active: {activeProvider === "deepseek" ? "DeepSeek" : "Anthropic"}
          </span>
        </div>
        {providerStats.length === 0 ? (
          <p className="mt-4 text-base text-muted-foreground">
            No LLM calls in the window.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full table-auto text-base">
              <thead className="text-left text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="whitespace-nowrap py-2 pr-3">Model</th>
                  <th className="whitespace-nowrap py-2 px-3 text-right">Calls</th>
                  <th className="whitespace-nowrap py-2 px-3 text-right">Total cost</th>
                  <th className="whitespace-nowrap py-2 px-3 text-right">Avg / call</th>
                  <th className="hidden whitespace-nowrap py-2 px-3 text-right md:table-cell">
                    Cache hit %
                  </th>
                  <th className="hidden whitespace-nowrap py-2 px-3 text-right sm:table-cell">
                    Searches
                  </th>
                  <th className="hidden whitespace-nowrap py-2 px-3 text-right lg:table-cell">
                    Output tokens
                  </th>
                  <th className="whitespace-nowrap py-2 pl-3 text-right">
                    % of spend
                  </th>
                </tr>
              </thead>
              <tbody>
                {providerStats.map((p) => {
                  const m = modelLabel(p.model);
                  const avg = p.calls > 0 ? p.total_cost / p.calls : 0;
                  const totalInputForCache =
                    p.total_input + p.total_cache_read;
                  const cachePct =
                    totalInputForCache > 0
                      ? (p.total_cache_read / totalInputForCache) * 100
                      : 0;
                  const sharePct =
                    grandTotal > 0 ? (p.total_cost / grandTotal) * 100 : 0;
                  return (
                    <tr
                      key={p.model}
                      className="border-b border-border/60 text-text/90"
                    >
                      <td className="whitespace-nowrap py-3.5 pr-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.tone}`}
                        >
                          {m.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3.5 px-3 text-right font-mono text-base">
                        {p.calls}
                      </td>
                      <td className="whitespace-nowrap py-3.5 px-3 text-right font-mono text-base font-semibold">
                        ${p.total_cost.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap py-3.5 px-3 text-right font-mono text-base">
                        ${avg.toFixed(4)}
                      </td>
                      <td className="hidden whitespace-nowrap py-3.5 px-3 text-right font-mono text-base md:table-cell">
                        {cachePct.toFixed(0)}%
                      </td>
                      <td className="hidden whitespace-nowrap py-3.5 px-3 text-right font-mono text-base sm:table-cell">
                        {p.total_searches}
                      </td>
                      <td className="hidden whitespace-nowrap py-3.5 px-3 text-right font-mono text-base lg:table-cell">
                        {p.total_output.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap py-3.5 pl-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-dark4">
                            <div
                              className={`h-full rounded-full ${m.provider === "deepseek" ? "bg-info" : m.provider === "anthropic" ? "bg-orange" : "bg-dim"}`}
                              style={{ width: `${sharePct}%` }}
                            />
                          </div>
                          <span className="font-mono text-base text-muted-foreground">
                            {sharePct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-text">
                  <td className="py-3.5 pr-3 text-sm font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                    Total
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-base">
                    {providerStats.reduce((s, p) => s + p.calls, 0)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-base font-semibold">
                    ${grandTotal.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-3" />
                  <td className="hidden md:table-cell" />
                  <td className="hidden whitespace-nowrap py-3.5 px-3 text-right font-mono text-base sm:table-cell">
                    {providerStats.reduce((s, p) => s + p.total_searches, 0)}
                  </td>
                  <td className="hidden whitespace-nowrap py-3.5 px-3 text-right font-mono text-base lg:table-cell">
                    {providerStats
                      .reduce((s, p) => s + p.total_output, 0)
                      .toLocaleString()}
                  </td>
                  <td className="py-3.5 pl-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-orange">
          Submission funnel
        </h2>
        <ul className="mt-5 space-y-4">
          {FUNNEL_ORDER.map((name) => {
            const count = counts[name] ?? 0;
            const pct = (count / funnelMax) * 100;
            return (
              <li key={name}>
                <div className="flex items-baseline justify-between text-base">
                  <span className="font-mono text-base text-text">{name}</span>
                  <span className="font-mono text-base text-muted-foreground">
                    {count}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-dark4">
                  <div
                    className="h-full rounded-full bg-orange"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-orange">
          Other events
        </h2>
        {otherEvents.length === 0 ? (
          <p className="mt-4 text-base text-muted-foreground">
            Nothing else recorded in the window.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {(() => {
              const otherMax = Math.max(1, ...otherEvents.map(([, c]) => c));
              return otherEvents.map(([name, count]) => {
                const pct = (count / otherMax) * 100;
                return (
                  <li key={name}>
                    <div className="flex items-baseline justify-between text-base">
                      <span className="font-mono text-base text-text">
                        {name}
                      </span>
                      <span className="font-mono text-base text-muted-foreground">
                        {count}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-dark4">
                      <div
                        className="h-full rounded-full bg-orange/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              });
            })()}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "success" | "warn" | "danger";
}) {
  const accentClass =
    accent === "success"
      ? "text-success"
      : accent === "warn"
        ? "text-warn"
        : "text-danger";
  return (
    <div className="panel p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${accentClass}`}>{value}</p>
    </div>
  );
}
