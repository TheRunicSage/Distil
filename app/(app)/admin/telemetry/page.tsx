// Admin telemetry page. 7-day event counts grouped by event name,
// plus a small submission outcome funnel. Useful answer to "how many
// people made it through the funnel last week" without leaving the
// app.

import { createServiceClient } from "@/lib/supabase/service";

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

  const { data } = await service
    .from("telemetry_events")
    .select("name, properties")
    .gte("created_at", since);

  const counts: Record<string, number> = {};
  let outcomes = { success: 0, insufficient_input: 0, error: 0 };
  for (const row of data ?? []) {
    counts[row.name] = (counts[row.name] ?? 0) + 1;
    if (row.name === "generation.finalized" && row.properties) {
      const outcome = (row.properties as { outcome?: string }).outcome;
      if (outcome === "success") outcomes.success += 1;
      else if (outcome === "insufficient_input")
        outcomes.insufficient_input += 1;
      else if (outcome === "error") outcomes.error += 1;
    }
  }

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
        <h1 className="text-2xl font-semibold text-text">Telemetry</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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

      <section className="rounded-lg border border-border bg-dark3 p-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Submission funnel
        </h2>
        <ul className="mt-4 space-y-3">
          {FUNNEL_ORDER.map((name) => {
            const count = counts[name] ?? 0;
            const pct = (count / funnelMax) * 100;
            return (
              <li key={name}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-mono text-xs text-text">{name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {count}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-dark4">
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

      <section className="rounded-lg border border-border bg-dark3 p-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Other events
        </h2>
        {otherEvents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing else recorded in the window.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(() => {
              const otherMax = Math.max(1, ...otherEvents.map(([, c]) => c));
              return otherEvents.map(([name, count]) => {
                const pct = (count / otherMax) * 100;
                return (
                  <li key={name}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-mono text-xs text-text">
                        {name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {count}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-dark4">
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
    <div className="rounded-lg border border-border bg-dark3 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}
