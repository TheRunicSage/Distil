"use client";

// Screen 9 / 10 / 12 controls. Two simple POST endpoints; the parent
// page passes attemptNumber to decide whether to show the retry form
// (attempts 1-2) or the "continue queue" abandon-only path (attempt 3,
// per app_handoff §7).

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Props = {
  applicationId: string;
  attemptNumber: number;
  parentJd: string;
  parentNotes: string | null;
};

export function RetryAbandonControls({
  applicationId,
  attemptNumber,
  parentJd,
  parentNotes,
}: Props) {
  const router = useRouter();
  const isFinalAttempt = attemptNumber >= 3;
  const [jd, setJd] = useState(parentJd);
  const [notes, setNotes] = useState(parentNotes ?? "");
  const [useNewCv, setUseNewCv] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callRoute(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; data: unknown }> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data as { error?: { message?: string } } | null)?.error?.message ??
            "Action failed. Try again.",
        );
        setPending(false);
        return { ok: false, data: null };
      }
      return { ok: true, data };
    } catch {
      setError("Network error. Try again.");
      setPending(false);
      return { ok: false, data: null };
    }
  }

  async function retry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { ok, data } = await callRoute(
      `/api/applications/${applicationId}/retry`,
      {
        job_description: jd,
        user_notes: notes.trim() || undefined,
        use_new_master_cv: useNewCv,
      },
    );
    if (ok) {
      // The retry route returns { id, parent_application_id, attempt_number }
      // for the new row. Navigate the user to that new generation's
      // detail page so they can watch it run, instead of bouncing back
      // to /dashboard and losing context. Falls back to /dashboard if
      // the response shape is unexpected.
      const newId = (data as { id?: string } | null)?.id;
      router.push(newId ? `/application/${newId}` : "/dashboard");
      router.refresh();
    }
  }

  async function abandon() {
    const { ok } = await callRoute(
      `/api/applications/${applicationId}/abandon`,
    );
    if (ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  if (isFinalAttempt) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Three attempts is the cap. You can continue with anything you have
          queued and contact support if you&apos;d like a closer look at this
          one.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={abandon}
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Working…" : "Continue queued applications"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={retry} className="space-y-5">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Job description
        </span>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={10}
          className="mt-2 block w-full resize-y rounded-sm border border-border bg-dark3 p-3 text-sm text-text focus:border-orange focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-2 block w-full resize-y rounded-sm border border-border bg-dark3 p-3 text-sm text-text focus:border-orange focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={useNewCv}
          onChange={(e) => setUseNewCv(e.target.checked)}
          className="h-4 w-4 accent-orange"
        />
        Use my new master CV for this retry?
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Retrying…" : "Retry"}
        </button>
        <button
          type="button"
          onClick={abandon}
          disabled={pending}
          className="btn-secondary"
        >
          Abandon
        </button>
      </div>
    </form>
  );
}
