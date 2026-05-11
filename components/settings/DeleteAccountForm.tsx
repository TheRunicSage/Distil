"use client";

// Delete-account confirmation form. Two-step flow:
//   1. User clicks "Delete account" — reveals the confirmation panel.
//   2. User types their email and clicks "Permanently delete" — fires
//      the deleteAccount Server Action.
// The destructive button stays disabled until the typed email exactly
// matches the user's session email, so the trigger is never one click
// from the relaxed default state.

import { useState, useActionState } from "react";
import {
  deleteAccount,
  type DeleteAccountResult,
} from "@/app/(app)/settings/actions";

export function DeleteAccountForm({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<
    DeleteAccountResult,
    FormData
  >(deleteAccount, undefined);
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  if (!open) {
    return (
      <div>
        <p className="mt-4 text-sm text-muted-foreground">
          Permanently remove your account and all stored data.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          This deletes your master CV, applications, and tailored documents.
          Action is irreversible.
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-5 py-2.5 text-sm font-medium text-danger transition-[transform,box-shadow,background-color,border-color] duration-200 hover:bg-danger/20 hover:shadow-[0_4px_14px_rgba(220,38,38,0.18)] motion-safe:active:scale-[0.97]"
          >
            Delete account
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <p className="text-sm text-text">
        Type your email <span className="font-mono text-text">{email}</span> to
        confirm.
      </p>
      <input
        type="email"
        name="confirm_email"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        autoFocus
        placeholder={email}
        className="block w-full rounded-md border border-border bg-dark2/60 px-3 py-2 text-sm text-text backdrop-blur-sm placeholder:text-muted-foreground focus:border-orange/60 focus:outline-none focus:ring-2 focus:ring-orange/20"
      />
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!matches || pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] duration-200 hover:bg-danger/90 hover:shadow-[0_6px_18px_rgba(220,38,38,0.32)] disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.97]"
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          disabled={pending}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
