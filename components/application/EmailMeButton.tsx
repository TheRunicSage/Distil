"use client";

// "Email me both documents" CTA on /application/[id] success view.
// One-click action (DP-4 A): click → POST /api/applications/[id]/email
// → toast success/error. No modal. Recipient is always the auth email
// (DP-1 A) so there's nothing to confirm before send.
//
// Companion "i" affordance opens a small popover hinting at the
// auto-email preference under /settings. The popover renders via
// createPortal to document.body with a fixed-position style + computed
// coords on every relevant event — same shape as DownloadDropdown
// (Decision Log [14] 2026-05-08 entry). Without the portal, the
// popover's z-index lives inside the parent surface-card's
// backdrop-blur stacking context, so the next sibling section (the
// preview viewport-breakout block) renders over it. Portal sidesteps
// every parent stacking context.
//
// When the row's last_emailed_at is non-null on initial render, we
// show a muted "Emailed X ago" line beneath the button. After a
// successful send we router.refresh() so the line picks up the new
// stamp from the server.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InfoIcon, MailIcon } from "lucide-react";

import { useToast } from "@/components/ui/toast";

type Props = {
  applicationId: string;
  lastEmailedAt: string | null;
};

const POPOVER_WIDTH = 288; // w-72
const POPOVER_OFFSET = 8; // px below the trigger
const VIEWPORT_MARGIN = 12; // keep popover off the viewport edge

type Position = { top: number; left: number } | null;

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
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Position>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // createPortal needs document — defer rendering until mount so SSR
  // doesn't choke. Trigger renders on the server in the closed state.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-compute popover position from the trigger's bounding rect.
  // Right-aligned to the trigger; clamped to the viewport. Re-runs on
  // scroll + resize so the popover tracks the trigger reliably.
  useLayoutEffect(() => {
    if (!hintOpen) return;
    function update() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const top = rect.bottom + POPOVER_OFFSET;
      let left = rect.right - POPOVER_WIDTH;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN;
      if (left > maxLeft) left = maxLeft;
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
      setPos({ top, left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [hintOpen]);

  // Esc + outside-click dismiss.
  useEffect(() => {
    if (!hintOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHintOpen(false);
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setHintOpen(false);
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
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Tier-2 ghost-pill style: subtle orange-tinted background with a
          soft border + hover lift. The canonical actions on this view
          are the per-document Download buttons inside each preview
          card; this CTA is one tier down. Compact text-sm sizing,
          rounded-lg pill, soft orange ring on hover for a modern
          Linear / Vercel-style feel without competing with the
          downloads. */}
      <button
        type="button"
        onClick={send}
        disabled={pending}
        aria-label="Email me both documents"
        className="group inline-flex items-center gap-2 rounded-lg border border-orange/25 bg-orange/10 px-3.5 py-1.5 text-sm font-medium text-orange transition-all hover:border-orange/50 hover:bg-orange/15 hover:shadow-md hover:shadow-orange/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none"
      >
        <MailIcon
          size={14}
          aria-hidden
          className="transition-transform group-hover:-translate-y-px"
        />
        <span>{pending ? "Sending…" : "Email me both documents"}</span>
      </button>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setHintOpen((v) => !v)}
        aria-label="About auto-email"
        aria-haspopup="dialog"
        aria-expanded={hintOpen}
        title="About auto-email"
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-dark3 hover:text-text"
      >
        <InfoIcon size={14} aria-hidden />
      </button>
      {lastEmailedAt && (
        <span className="ml-1 text-xs text-muted-foreground">
          Emailed {formatRelative(lastEmailedAt)}
        </span>
      )}

      {mounted &&
        hintOpen &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="About auto-email"
            // Fixed positioning + portal to body sidesteps every
            // parent stacking context. z-50 sits above the (app)
            // shell's sticky topbar (z-30) and any other floating
            // chrome.
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
            }}
            className="z-50 rounded-2xl border border-border bg-dark4 p-4 text-sm leading-relaxed text-text shadow-lg backdrop-blur-md"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
