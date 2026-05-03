// Admin errors page. Last 20 error rows from request_logs across api
// routes, inngest steps, and crons. Compact one-row-per-error layout
// with a native <details> for the full message + footer metadata, so
// the dense-by-default view fits more on screen and only expands the
// rows the admin actually wants to inspect.

import { createServiceClient } from "@/lib/supabase/service";
import { userPillLabel, userPillTone } from "@/lib/admin/user-pill";

export const dynamic = "force-dynamic";

const SOURCE_TONE: Record<string, string> = {
  api_route: "bg-info/15 text-info border-info/25",
  inngest_step: "bg-innovation/15 text-innovation border-innovation/25",
  cron: "bg-warn/15 text-warn border-warn/25",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Errors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 20 error rows from request_logs. Click a row for the full
          message.
        </p>
      </div>

      {errors.length === 0 ? (
        <div className="panel p-12 text-center text-muted-foreground">
          Nothing failed recently.
        </div>
      ) : (
        <ul className="panel overflow-hidden">
          {errors.map((row) => {
            const tone =
              SOURCE_TONE[row.source] ??
              "bg-dim/15 text-muted-foreground border-border";
            return (
              <li
                key={row.id}
                className="border-t border-border first:border-t-0"
              >
                <details className="group">
                  <summary className="grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-dark4">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
                    >
                      {row.source.replace("_", " ")}
                    </span>
                    <span
                      className={`hidden items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold sm:inline-flex ${userPillTone(row.user_id)}`}
                      title={row.user_id ? `user ${row.user_id}` : "no user"}
                    >
                      {userPillLabel(row.user_id)}
                    </span>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-text">
                        {row.name}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {truncate(row.error_message, 90)}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-danger">
                      {row.error_code ?? "internal_error"}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTime(row.created_at)}
                    </span>
                  </summary>
                  <div className="border-t border-border bg-dark2/40 px-4 py-3">
                    {row.error_message && (
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text/90">
                        {row.error_message}
                      </pre>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{row.duration_ms}ms</span>
                      {row.application_id && (
                        <span className="font-mono">
                          app {row.application_id.slice(0, 8)}
                        </span>
                      )}
                      {row.user_id && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${userPillTone(row.user_id)}`}
                          title={`user ${row.user_id}`}
                        >
                          {userPillLabel(row.user_id)}
                        </span>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
