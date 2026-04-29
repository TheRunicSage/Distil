// Admin errors page. Last 20 error rows from request_logs across api
// routes, inngest steps, and crons. Source-coloured so triage can scan
// "is this an API thing or a pipeline thing?" at a glance.

import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const SOURCE_TONE: Record<string, string> = {
  api_route: "bg-info/15 text-info border-info/25",
  inngest_step: "bg-innovation/15 text-innovation border-innovation/25",
  cron: "bg-warn/15 text-warn border-warn/25",
};

export default async function AdminLogsPage() {
  const service = createServiceClient();
  const { data } = await service
    .from("request_logs")
    .select(
      "id, created_at, source, name, status, error_code, error_message, duration_ms, application_id, user_id",
    )
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(20);

  const errors = data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Errors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 20 error rows from request_logs.
        </p>
      </div>

      {errors.length === 0 ? (
        <div className="rounded-lg border border-border bg-dark3 p-12 text-center text-muted-foreground">
          Nothing failed recently.
        </div>
      ) : (
        <div className="space-y-3">
          {errors.map((row) => {
            const tone =
              SOURCE_TONE[row.source] ??
              "bg-dim/15 text-muted-foreground border-border";
            return (
              <article
                key={row.id}
                className="rounded-lg border border-border bg-dark3 p-4"
              >
                <header className="flex flex-wrap items-baseline gap-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
                  >
                    {row.source.replace("_", " ")}
                  </span>
                  <span className="font-mono text-xs text-text">
                    {row.name}
                  </span>
                  <span className="font-mono text-xs text-danger">
                    {row.error_code ?? "internal_error"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("en-NZ", {
                      timeZone: "Pacific/Auckland",
                    })}
                  </span>
                </header>
                {row.error_message && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text/90">
                    {row.error_message}
                  </p>
                )}
                <footer className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                  <span>{row.duration_ms}ms</span>
                  {row.application_id && (
                    <span className="font-mono">
                      app {row.application_id.slice(0, 8)}
                    </span>
                  )}
                  {row.user_id && (
                    <span className="font-mono">
                      user {row.user_id.slice(0, 8)}
                    </span>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
