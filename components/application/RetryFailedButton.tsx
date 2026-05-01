"use client";

// Per-row Retry button for non-success terminal states (error, cancelled).
// Calls the same /api/applications/[id]/retry route that insufficient_input
// uses; the route accepts retry from any non-success terminal state under
// Option B. Keeps the JD and notes from the parent application unchanged
// — failed runs typically failed for system reasons rather than input.

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  applicationId: string;
  canRetry: boolean;
};

export function RetryFailedButton({ applicationId, canRetry }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canRetry) {
    return (
      <span className="text-xs text-muted-foreground">
        Attempt cap reached (3 of 3). Start a new application instead.
      </span>
    );
  }

  async function retry() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Retry failed. Try again.");
        setPending(false);
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        id?: string;
      } | null;
      if (body?.id) {
        router.push(`/application/${body.id}`);
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="btn-primary"
      >
        {pending ? "Retrying…" : "Retry this run"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
