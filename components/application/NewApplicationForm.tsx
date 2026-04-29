"use client";

// Submit-application form. Client Component because it needs:
//   - 3-second submit-button debounce after click (spec §7.6 Tier 2 #9)
//   - JD soft warning at <150 words
//   - Inline error rendering for the route's error envelope
// On success the route returns 202 + { id, queue_position }; we route
// straight to /application/[id] so the user lands on the live view.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const MIN_JD_CHARS = 150;
const SOFT_JD_WORDS = 150;
const DEBOUNCE_MS = 3000;

function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function NewApplicationForm() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [debounced, setDebounced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jdWords = wordCount(jd);
  const jdShort = jd.length > 0 && jdWords < SOFT_JD_WORDS;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || debounced) return;
    if (jd.trim().length < MIN_JD_CHARS) {
      setError(`Job description is too short (need at least ${MIN_JD_CHARS} characters).`);
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
        setError(body?.error?.message ?? "Submit failed. Try again.");
        setPending(false);
        return;
      }
      const data = (await res.json()) as { id: string };
      router.push(`/application/${data.id}`);
    } catch {
      setError("Network error. Try again.");
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
          <span className="text-[11px] text-muted-foreground">
            {jdWords} words
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
        {jdShort && (
          <p className="mt-1.5 text-xs text-warn">
            That looks short. Recruiters often paste partial postings;
            we work better with the full thing.
          </p>
        )}
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || debounced}
          className="rounded-sm bg-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit. We'll tailor your CV and cover letter."}
        </button>
        {debounced && !pending && (
          <span className="text-xs text-muted-foreground">
            (Just a sec — preventing duplicate submission.)
          </span>
        )}
      </div>
    </form>
  );
}
