"use client";

// Submit-application form. Client Component because it needs:
//   - 3-second submit-button debounce after click (spec §7.6 Tier 2 #9)
//   - Live JD strength gauge (under min / soft warning / comfortable)
//   - Inline + toast error rendering for the route's error envelope
// On success the route returns 202 + { id, queue_position }; we route
// straight to /application/[id] so the user lands on the live view.
//
// User notes intentionally not collected here. The route still accepts
// `user_notes` as an optional field for callers that pass it; this form
// is a single-purpose JD-paste surface.

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
  const [pending, setPending] = useState(false);
  const [debounced, setDebounced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jdWords = wordCount(jd);
  const strength = classify(jd, jdWords);
  const meta = STRENGTH_META[strength];
  const submitDisabled =
    pending || debounced || strength === "too_short" || strength === "empty";

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
        body: JSON.stringify({ job_description: jd }),
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
    <form onSubmit={submit} className="space-y-7">
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="jd-input" className="eyebrow">
            Job description
          </label>
          <span className="flex items-baseline gap-3 text-sm">
            <span className={meta.tone}>{meta.label}</span>
            <span className="text-muted-foreground">{jdWords} words</span>
          </span>
        </div>
        <textarea
          id="jd-input"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          required
          rows={16}
          placeholder="Paste the full posting here — title, company, responsibilities, requirements, the whole thing."
          className="mt-5 block w-full resize-y rounded-2xl border border-border bg-dark2/60 p-5 text-base leading-relaxed text-text backdrop-blur-sm placeholder:text-muted-foreground focus:border-orange/60 focus:outline-none focus:ring-2 focus:ring-orange/20"
        />
        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-dark3">
          <div
            className={`h-full transition-all duration-300 ${STRENGTH_BAR[strength]}`}
            style={{ width: `${meta.bar}%` }}
          />
        </div>
        <p className="mt-4 min-h-[1.75rem] text-base">
          {strength === "too_short" && (
            <span className="text-danger">
              We need at least {MIN_JD_CHARS} characters before submitting.
            </span>
          )}
          {strength === "short" && (
            <span className="text-warn">
              Looks short. Recruiters often paste partial postings; we work
              better with the full thing ({COMFORTABLE_JD_WORDS}+ words is
              ideal).
            </span>
          )}
          {strength === "ok" && (
            <span className="text-muted-foreground">
              Good size. We&apos;ll calibrate seniority and tailor accordingly.
            </span>
          )}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-base text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitDisabled}
          className="btn-primary"
        >
          {pending && (
            <span
              aria-hidden
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {pending ? "Submitting…" : "Tailor my CV and cover letter"}
        </button>
        {debounced && !pending && (
          <span className="text-sm text-muted-foreground">
            Just a sec — preventing duplicate submission.
          </span>
        )}
      </div>
    </form>
  );
}
