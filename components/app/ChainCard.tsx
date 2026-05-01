// Renders one application chain as a single row with optional
// inline disclosure of retries. The card's main link goes to the
// chain's anchor (success leaf if any, else latest leaf). When the
// chain has more than one attempt, a "<n> attempts" toggle expands
// the per-attempt list — using a native <details>/<summary> element
// so this stays a server component (no client JS needed).

import Link from "next/link";
import { type ChainCard as Chain, chainToneClass } from "@/lib/applications/chains";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ChainCard({ chain }: { chain: Chain }) {
  const hasRetries = chain.attempts.length > 1;
  const tone = chainToneClass(chain.effectiveTone);

  return (
    <article className="rounded-xl border border-border bg-dark2/60 backdrop-blur-sm transition-colors hover:border-orange/40">
      <Link
        href={`/application/${chain.anchorId}`}
        className="flex items-center gap-4 px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text">
            {chain.title ?? (
              <span className="font-mono text-text/70">
                {chain.fallbackId}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(chain.latestActivityAt)}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
        >
          {chain.effectiveLabel}
        </span>
      </Link>

      {hasRetries && (
        <details className="border-t border-border/50">
          <summary className="cursor-pointer px-4 py-2 text-[11px] text-muted-foreground transition-colors hover:text-text">
            {chain.attempts.length} attempts
          </summary>
          <ul className="space-y-1 px-4 pb-3 pt-1 text-xs">
            {chain.attempts.map((a, i) => (
              <li key={a.id}>
                <Link
                  href={`/application/${a.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-dark3/60"
                >
                  <span className="text-muted-foreground">#{i + 1}</span>
                  <span className="font-mono text-[11px] text-text/70">
                    {a.id.slice(0, 8)}
                  </span>
                  <span
                    className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${chainToneClass(a.effectiveTone)}`}
                  >
                    {a.effectiveLabel}
                  </span>
                  <span className="w-32 shrink-0 text-right text-[11px] text-muted-foreground">
                    {formatDate(a.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
