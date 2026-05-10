// Horizontal-split header for a .surface-card. Used on Settings, Upload,
// Application detail. Left: serif title + meta sub. Right: action slot
// (typically <Link className="btn-secondary btn-sm">…</Link>).
// Wrap inside a <section className="surface-card">; the header sits at
// the top of the surface, content follows.

import type { ReactNode } from "react";

type Props = {
  title: string;
  meta?: string;
  action?: ReactNode;
};

export function SurfaceHeader({ title, meta, action }: Props) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-serif text-2xl font-normal tracking-tight text-text">
          {title}
        </h2>
        {meta ? <p className="mt-1 text-meta">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
