"use client";

// Optimistic toggle for profiles.email_on_generation. Click flips
// state immediately; useTransition + server action persists in the
// background; toast surfaces failures. router.refresh() pulls the
// definitive value back from the server so a failure rolls the UI
// back without an extra useState juggle.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setEmailOnGeneration } from "@/app/(app)/settings/actions";
import { useToast } from "@/components/ui/toast";

type Props = {
  initialValue: boolean;
  email: string;
};

export function EmailOnGenerationToggle({ initialValue, email }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [optimistic, setOptimistic] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await setEmailOnGeneration(next);
        router.refresh();
        toast.push(
          next
            ? `Auto-email is on — we'll send to ${email} after each successful generation.`
            : `Auto-email is off.`,
          "success",
        );
      } catch {
        setOptimistic(!next);
        toast.push("Couldn't save your preference. Try again.", "error");
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-base text-text">
          Email me documents after generation
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          When on, Distil sends your tailored CV and cover letter to{" "}
          <span className="text-text">{email}</span> as soon as a generation
          succeeds. Off by default.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label="Email me documents after generation"
        onClick={onToggle}
        disabled={pending}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          optimistic
            ? "border-orange/60 bg-orange"
            : "border-border bg-dark3"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            optimistic ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
