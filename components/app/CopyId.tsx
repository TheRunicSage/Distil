"use client";

// Click-to-copy chip for application IDs and similar mono identifiers.
// Shows the truncated id; full id copies to clipboard with a 2s
// "Copied" inline confirmation. No emoji per brand spec §12.10.

import { useState } from "react";
import { useToast } from "@/components/ui/toast";

export function CopyId({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const display = label ?? value.slice(0, 8);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.push("Copied to clipboard.", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push("Could not copy. Select and copy manually.", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${value}`}
      className={`group inline-flex items-center gap-1.5 rounded-sm border border-border bg-dark3 px-2 py-0.5 font-mono text-xs text-text transition-colors hover:border-orange/40 hover:bg-dark4 hover:shadow-[0_2px_8px_rgba(226,97,59,0.08)] motion-safe:active:scale-[0.97] ${className ?? ""}`}
    >
      <span>{display}</span>
      <span className="text-[10px] text-muted-foreground transition-colors group-hover:text-orange">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
