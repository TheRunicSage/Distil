// History page. Reverse-chronological flat list of every application
// belonging to the user. Retry rows show a "Retry of {date}" subtitle
// (resolved client-side from a parent-id map). v1 has no search/filter
// (open question #1).

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, status, attempt_number, parent_application_id, created_at, completed_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const all = rows ?? [];
  const parentDates = new Map<string, string>();
  for (const r of all) parentDates.set(r.id, r.created_at);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every application you&apos;ve submitted, newest first.
        </p>
      </header>

      {all.length === 0 ? (
        <div className="rounded-lg border border-border bg-dark3 p-12 text-center text-muted-foreground">
          You haven&apos;t submitted any applications yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {all.map((row) => {
            const tone =
              STATUS_TONE[row.status] ??
              "bg-dim/15 text-muted-foreground border-border";
            const parentDate = row.parent_application_id
              ? parentDates.get(row.parent_application_id)
              : null;
            return (
              <li key={row.id}>
                <Link
                  href={`/application/${row.id}`}
                  className="flex items-center gap-4 rounded-sm border border-border bg-dark3 px-4 py-3 transition-colors hover:bg-dark4"
                >
                  <span className="font-mono text-xs text-text">
                    {row.id.slice(0, 8)}
                  </span>
                  <div className="flex-1">
                    {parentDate && (
                      <span className="block text-[11px] text-muted-foreground">
                        Retry of{" "}
                        {new Date(parentDate).toLocaleDateString("en-NZ", {
                          timeZone: "Pacific/Auckland",
                        })}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    attempt {row.attempt_number}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
                  >
                    {row.status}
                  </span>
                  <span className="w-44 text-right text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("en-NZ", {
                      timeZone: "Pacific/Auckland",
                    })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
