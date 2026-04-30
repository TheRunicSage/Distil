// "Pro tip" callout — orange-subtle background with a brand-orange
// left border. Used to nudge the user with a hint that's not a hard
// rule (e.g. "include every project, we'll pick the relevant ones").
// Bold prefix is rendered automatically; pass plain children for the
// rest of the body.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ProTipProps = {
  label?: string;
  className?: string;
  children: ReactNode;
};

export function ProTip({ label = "Pro tip", className, children }: ProTipProps) {
  return (
    <div
      className={cn(
        "rounded-md border-l-2 border-orange bg-[var(--color-orange-subtle)] px-4 py-3 text-sm leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <strong className="font-semibold text-text">{label}:</strong>{" "}
      {children}
    </div>
  );
}
