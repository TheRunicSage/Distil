"use client";

// Client-side shell that wraps the (app) layout's children with the
// toast provider and a small set of keyboard shortcuts. Server-side
// auth gating still happens in the parent server layout.

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ToastProvider, useKeyboardShortcuts } from "@/components/ui/toast";

function ShortcutLayer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useKeyboardShortcuts({
    n: () => router.push("/application/new"),
    d: () => router.push("/dashboard"),
    h: () => router.push("/history"),
    s: () => router.push("/settings"),
    "?": () => setHelpOpen((v) => !v),
  });

  return (
    <>
      {children}
      {helpOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-dark2 p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
              Keyboard shortcuts
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["N", "New application"],
                ["D", "Dashboard"],
                ["H", "History"],
                ["S", "Settings"],
                ["?", "Toggle this dialog"],
              ].map(([key, label]) => (
                <div key={key} className="flex justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>
                    <kbd className="rounded-sm border border-border bg-dark3 px-2 py-0.5 font-mono text-xs text-text">
                      {key}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Shortcuts are ignored while typing in a text field.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ShortcutLayer>{children}</ShortcutLayer>
    </ToastProvider>
  );
}
