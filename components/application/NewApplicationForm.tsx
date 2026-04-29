"use client";

// Submit-application form. Client Component because it needs:
//   - 3-second submit-button debounce after click (spec §7.6 Tier 2 #9)
//   - Live JD strength gauge (under min / soft warning / comfortable)
//   - Inline + toast error rendering for the route's error envelope
// On success the route returns 202 + { id, queue_position }; we route
// straight to /application/[id] so the user lands on the live view.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useToast } from "@/components/ui/toast";

const MIN_JD_CHARS = 150;
const SOFT_JD_WORDS = 150;
const COMFORTABLE_JD_WORDS = 300;
const DEBOUNCE_MS = 3000;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

type Strength = "empty" | "too_short" | "short" | "ok";

function classify(jd: string, words: number): Strength {
  if (jd.trim().length === 0) return "empty";
  if (jd.trim().length < MIN_JD_CHARS) return "too_short";
  if (words < SOFT_JD_WORDS) return "short";
  return "ok";
}

const STRENGTH_META: Record<
  Strength,
  { tone: string; label: string; bar: number }
> = {
  empty: { tone: "text-muted-foreground", label: "—", bar: 0 },
  too_short: { tone: "text-danger", label: "Too short", bar: 25 },
  short: { tone: "text-warn", label: "A bit thin", bar: 60 },
  ok: { tone: "text-success", label: "Good", bar: 100 },
};

const STRENGTH_BAR: Record<Strength, string> = {
  empty: "bg-border",
  too_short: "bg-danger",
  short: "bg-warn",
  ok: "bg-success",
};

export function NewApplicationForm() {
  const router = useRouter();
  const toast = useToast();
  const [jd, setJd] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [debounced, setDebounced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jdWords = wordCount(jd);
  const strength = classify(jd, jdWords);
  const meta = STRENGTH_META[strength];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || debounced) return;
    if (jd.trim().length < MIN_JD_CHARS) {
      const msg = `Job description is too short (need at least ${MIN_JD_CHARS} characters).`;
      setError(msg);
      toast.push(msg, "warn");
      return;
    }
    setPending(true);
    setError(null);
    setDebounced(true);
    setTimeout(() => setDebounced(false), DEBOUNCE_MS);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_description: jd,
          user_notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? "Submit failed. Try again.";
        setError(msg);
        toast.push(msg, "error");
        setPending(false);
        return;
      }
      const data = (await res.json()) as { id: string };
      toast.push("Submitted. We'll start tailoring shortly.", "success");
      router.push(`/application/${data.id}`);
    } catch {
      const msg = "Network error. Try again.";
      setError(msg);
      toast.push(msg, "error");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <label className="block">
        <span className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            Job description
          </span>
          <span className="flex items-baseline gap-3 text-[11px]">
            <span className={meta.tone}>{meta.label}</span>
            <span className="text-muted-foreground">{jdWords} words</span>
          </span>
        </span>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          required
          rows={14}
          placeholder="Paste the full posting here, including responsibilities and requirements."
          className="mt-2 block w-full resize-y rounded-sm border border-border bg-dark3 p-3 text-sm text-text placeholder:text-dim focus:border-orange focus:outline-none"
        />
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-dark2">
          <div
            className={`h-full transition-all duration-300 ${STRENGTH_BAR[strength]}`}
            style={{ width: `${meta.bar}%` }}
          />
        </div>
        <p className="mt-1.5 min-h-[1rem] text-xs">
          {strength === "too_short" && (
            <span className="text-danger">
              We need at least {MIN_JD_CHARS} characters before submitting.
            </span>
          )}
          {strength === "short" && (
            <span className="text-warn">
              That looks short. Recruiters often paste partial postings; we
              work better with the full thing ({COMFORTABLE_JD_WORDS}+ words is
              ideal).
            </span>
          )}
          {strength === "ok" && (
            <span className="text-muted-foreground">
              Good size. We&apos;ll calibrate seniority and tailor accordingly.
            </span>
          )}
        </p>
      </label>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Anything you want emphasised or downplayed (e.g. 'lean into AWS work', 'leaving the recruiter context out')."
          className="mt-2 block w-full resize-y rounded-sm border border-border bg-dark3 p-3 text-sm text-text placeholder:text-dim focus:border-orange focus:outline-none"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || debounced || strength === "too_short" || strength === "empty"}
          className="inline-flex items-center gap-2 rounded-sm bg-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && (
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {pending
            ? "Submitting…"
            : "Submit. We'll tailor your CV and cover letter."}
        </button>
        {debounced && !pending && (
          <span className="text-xs text-muted-foreground">
            Just a sec — preventing duplicate submission.
          </span>
        )}
      </div>
    </form>
  );
}
