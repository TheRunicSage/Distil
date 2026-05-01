"use client";

// Client-side filter + search for the History page. Receives
// already-grouped chains from the Server Component and applies
// effective-status pill filters + a free-text title/id filter in
// memory. 200-row cap from the parent keeps this fast.

import { useMemo, useState } from "react";
import { ChainCard } from "@/components/app/ChainCard";
import type { ChainCard as Chain, ChainStatus } from "@/lib/applications/chains";

const FILTERS: {
  key: "all" | ChainStatus;
  label: string;
  match: (c: Chain) => boolean;
}[] = [
  { key: "all", label: "All", match: () => true },
  {
    key: "in_progress",
    label: "In progress",
    match: (c) => c.effectiveStatus === "in_progress",
  },
  {
    key: "ready",
    label: "Ready",
    match: (c) => c.effectiveStatus === "ready",
  },
  {
    key: "needs_more_info",
    label: "Needs info",
    match: (c) => c.effectiveStatus === "needs_more_info",
  },
  {
    key: "didnt_finish",
    label: "Didn’t finish",
    match: (c) => c.effectiveStatus === "didnt_finish",
  },
];

export function HistoryList({ chains }: { chains: Chain[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = chains.filter(f.match).length;
    return c;
  }, [chains]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const q = query.trim().toLowerCase();
    return chains.filter((c) => {
      if (!f.match(c)) return false;
      if (!q) return true;
      if (c.title?.toLowerCase().includes(q)) return true;
      if (c.attempts.some((a) => a.id.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [chains, filter, query]);

  if (chains.length === 0) {
    return (
      <div className="surface-card text-center text-muted-foreground">
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
                    ? "border-orange/60 bg-[var(--color-orange-subtle)] text-orange"
                    : "border-border bg-dark2/60 text-muted-foreground hover:border-orange/40 hover:text-text"
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
          placeholder="Filter by title or id…"
          className="ml-auto w-full max-w-xs rounded-md border border-border bg-dark2/60 px-3 py-1.5 text-xs text-text backdrop-blur-sm placeholder:text-muted-foreground focus:border-orange/60 focus:outline-none focus:ring-2 focus:ring-orange/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card text-center text-sm text-muted-foreground">
          Nothing matches that filter.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.rootId}>
              <ChainCard chain={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
