// Renders one application chain as a single row with optional
// inline disclosure of retries. The card's main link goes to the
// chain's anchor (success leaf if any, else latest leaf). When the
// chain has more than one attempt, a "<n> attempts" toggle expands
// the per-attempt list — using a native <details>/<summary> element
// so this stays a server component (no client JS needed).
//
// 2026-05-03: Ready chains get a small download dropdown next to
// the status pill (lives in DownloadDropdown — a client island that
// doesn't push the surrounding card into client-component territory).

import Link from "next/link";
import { type ChainCard as Chain, chainToneClass } from "@/lib/applications/chains";
import { DownloadDropdown } from "./DownloadDropdown";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Title shape from groupIntoChains is "${role_archetype} @ ${company_name}"
// when any descendant of the chain reached `success`. Highlight the
// company name in brand orange so the surface scans as "this role —
// where". If the title doesn't contain the " @ " separator (single
// field fallback or fallback id), render it untouched.
function renderTitle(title: string) {
  const atIdx = title.indexOf(" @ ");
  if (atIdx === -1) return title;
  const role = title.slice(0, atIdx);
  const company = title.slice(atIdx + 3);
  return (
    <>
      {role} <span className="text-muted-foreground">@</span>{" "}
      <span className="text-orange">{company}</span>
    </>
  );
}

export function ChainCard({ chain }: { chain: Chain }) {
  const hasRetries = chain.attempts.length > 1;
  const tone = chainToneClass(chain.effectiveTone);

  const showDownload = chain.effectiveStatus === "ready";

  return (
    <article className="rounded-xl border border-border bg-dark2/60 backdrop-blur-sm transition-[transform,box-shadow,border-color,background-color,color] duration-200 ease-out hover:border-orange/40 hover:shadow-[0_4px_14px_rgba(226,97,59,0.10)] motion-safe:hover:-translate-y-px motion-safe:hover:shadow-[0_8px_22px_rgba(226,97,59,0.16)]">
      <div className="relative">
        <Link
          href={`/application/${chain.anchorId}`}
          className="flex items-center gap-4 px-5 py-4 transition-transform motion-safe:active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-base text-text">
              {chain.title ? (
                renderTitle(chain.title)
              ) : (
                <span className="font-mono text-text/70">
                  {chain.fallbackId}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(chain.latestActivityAt)}
            </p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-bold uppercase tracking-[0.06em] ${tone}`}
          >
            {chain.effectiveLabel}
          </span>
          {showDownload && (
            // Spacer keeps the row layout stable when the dropdown
            // is absent. The actual dropdown is positioned absolute
            // outside the Link so its own click handlers can stop
            // propagation cleanly.
            <span className="h-9 w-9 shrink-0" aria-hidden="true" />
          )}
        </Link>
        {showDownload && (
          <div className="absolute right-5 top-1/2 -translate-y-1/2">
            <DownloadDropdown applicationId={chain.anchorId} />
          </div>
        )}
      </div>

      {hasRetries && (
        <details className="border-t border-border/50">
          <summary className="cursor-pointer px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-text motion-safe:active:scale-[0.99]">
            {chain.attempts.length} attempts
          </summary>
          <ul className="space-y-1 px-5 pb-3 pt-1 text-sm">
            {chain.attempts.map((a, i) => (
              <li key={a.id}>
                <Link
                  href={`/application/${a.id}`}
                  className="flex items-center gap-3 rounded-md px-3 py-2 transition-[transform,background-color,color] hover:bg-dark3/60 motion-safe:active:scale-[0.98]"
                >
                  <span className="text-muted-foreground">#{i + 1}</span>
                  <span className="font-mono text-sm text-text/70">
                    {a.id.slice(0, 8)}
                  </span>
                  <span
                    className={`ml-auto inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-bold uppercase tracking-[0.06em] ${chainToneClass(a.effectiveTone)}`}
                  >
                    {a.effectiveLabel}
                  </span>
                  <span className="w-32 shrink-0 text-right text-sm text-muted-foreground">
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
