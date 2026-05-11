"use client";

// "Email me both documents" CTA on /application/[id] success view.
// One-click action (DP-4 A): click → POST /api/applications/[id]/email
// → toast success/error. No modal. Recipient is always the auth email
// (DP-1 A) so there's nothing to confirm before send.
//
// Companion "i" affordance opens a small popover hinting at the
// auto-email preference under /settings — promoted from the
// info-icon hover behaviour we already use elsewhere.
//
// When the row's last_emailed_at is non-null on initial render, we
// show a muted "Emailed X ago" line beneath the button. After a
// successful send we router.refresh() so the line picks up the new
// stamp from the server.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { InfoIcon, MailIcon } from "lucide-react";

import { useToast } from "@/components/ui/toast";

type Props = {
  applicationId: string;
  lastEmailedAt: string | null;
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export function EmailMeButton({ applicationId, lastEmailedAt }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const hintWrapRef = useRef<HTMLDivElement>(null);

  // Outside-click + Esc dismiss for the hint popover (same shape as
  // UserMenu — kept inline since the popover is one-off and small).
  useEffect(() => {
    if (!hintOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHintOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!hintWrapRef.current?.contains(e.target as Node)) setHintOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [hintOpen]);

  async function send() {
    setPending(true);
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Idempotency-Key guards against double-click + accidental
            // browser-back-then-resubmit. Scoped per click so two
            // genuine sends from different sessions both succeed.
            "Idempotency-Key": `email-${applicationId}-${Date.now()}`,
          },
          body: "{}",
        },
      );
      const body = (await res.json().catch(() => null)) as
        | { sent_to?: string; error?: { message?: string } }
        | null;
      if (!res.ok) {
        toast.push(
          body?.error?.message ??
            "Couldn't send the email. Try again, or download the files directly.",
          "error",
        );
        return;
      }
      const sentTo = body?.sent_to ?? "your inbox";
      toast.push(`Sent to ${sentTo} — check your inbox.`, "success");
      router.refresh();
    } catch {
      toast.push("Network hiccup — try again in a moment.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="btn-primary"
          aria-label="Email me both documents"
        >
          <MailIcon size={16} aria-hidden />
          <span>{pending ? "Sending…" : "Email me both documents"}</span>
        </button>
        <div className="relative" ref={hintWrapRef}>
          <button
            type="button"
            onClick={() => setHintOpen((v) => !v)}
            aria-label="About auto-email"
            aria-haspopup="dialog"
            aria-expanded={hintOpen}
            className="btn-icon"
            title="About auto-email"
          >
            <InfoIcon size={18} aria-hidden />
          </button>
          {hintOpen && (
            <div
              role="dialog"
              aria-label="About auto-email"
              className="panel absolute right-0 top-[calc(100%+8px)] z-40 w-72 max-w-[calc(100vw-1rem)] p-4 text-sm leading-relaxed text-text"
            >
              <p>
                Want this automatically after every successful generation?
              </p>
              <p className="mt-2 text-muted-foreground">
                Turn on{" "}
                <Link
                  href="/settings"
                  className="btn-link-orange"
                  onClick={() => setHintOpen(false)}
                >
                  Email me documents after generation
                </Link>{" "}
                in Settings.
              </p>
            </div>
          )}
        </div>
      </div>
      {lastEmailedAt && (
        <p className="text-meta text-muted-foreground">
          Emailed {formatRelative(lastEmailedAt)}.
        </p>
      )}
    </div>
  );
}
