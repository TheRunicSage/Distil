"use client";

// Client-side filter + search for the History page. Receives the
// already-fetched rows from the Server Component and applies status
// pill filters + a free-text id/notes filter in memory. 200-row cap
// from the parent keeps this fast without virtualisation.

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  id: string;
  status: string;
  attempt_number: number;
  parent_application_id: string | null;
  created_at: string;
  completed_at: string | null;
};

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

const FILTERS: {
  key: "all" | "active" | "success" | "needs_input" | "error";
  label: string;
  match: (row: Row) => boolean;
}[] = [
  { key: "all", label: "All", match: () => true },
  {
    key: "active",
    label: "In progress",
    match: (r) => r.status === "running" || r.status === "rendering",
  },
  { key: "success", label: "Success", match: (r) => r.status === "success" },
  {
    key: "needs_input",
    label: "Needs input",
    match: (r) => r.status === "insufficient_input",
  },
  {
    key: "error",
    label: "Errored",
    match: (r) => r.status === "error",
  },
];

export function HistoryList({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) {
      c[f.key] = rows.filter(f.match).length;
    }
    return c;
  }, [rows]);

  const parentDates = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.id, r.created_at);
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!f.match(r)) return false;
      if (q && !r.id.toLowerCase().includes(q) && !r.status.includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, filter, query]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-dark3 p-12 text-center text-muted-foreground">
        You haven&apos;t submitted any applications yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-orange bg-orange-dim text-orange"
                    : "border-border bg-dark3 text-muted-foreground hover:border-orange/40 hover:text-text"
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {counts[f.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by id or status…"
          className="ml-auto w-full max-w-xs rounded-sm border border-border bg-dark3 px-3 py-1.5 text-xs text-text placeholder:text-dim focus:border-orange focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-dark3 p-10 text-center text-sm text-muted-foreground">
          Nothing matches that filter.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
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
                  className="flex items-center gap-4 rounded-sm border border-border bg-dark3 px-4 py-3 transition-colors hover:border-orange/40 hover:bg-dark4"
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
