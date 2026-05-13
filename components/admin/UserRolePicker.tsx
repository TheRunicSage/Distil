"use client";

// Inline role picker for the admin/users table. Renders the three
// available roles as a segmented control:
//   - Current role is the "filled" pill in its role-toned colour.
//   - Other roles render as muted ghost pills.
//   - Click a non-current pill → server action commits the change.
// Destructive transitions (admin → anything) prompt via window.confirm
// so an accidental click can be walked back. Non-destructive
// transitions commit silently with an optimistic UI nudge.
//
// Last-admin guard lives server-side in actions.ts; this component
// surfaces whatever error message the action returns inline below
// the picker. The page server-revalidates on success so a successful
// commit flows through the normal render path — no client-side
// store to keep in sync.

import { useState, useTransition } from "react";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_TONES,
  ROLES,
  type Role,
} from "@/lib/auth/roles";
import { setUserRole } from "@/app/(app)/admin/users/actions";

type Props = {
  userId: string;
  email: string;
  currentRole: Role;
  // True when this row represents the currently signed-in admin.
  // We disable demotion of self to prevent accidental lockout
  // (the server-side last-admin guard still applies even if this
  // disable were bypassed; this is purely a UX nudge).
  isSelf?: boolean;
};

export function UserRolePicker({
  userId,
  email,
  currentRole,
  isSelf = false,
}: Props) {
  const [optimisticRole, setOptimisticRole] = useState<Role>(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function attemptChange(nextRole: Role) {
    if (nextRole === optimisticRole) return;

    // Confirm on destructive transitions — demoting away from admin
    // is the high-cost mistake we want to slow down.
    const isDestructive = optimisticRole === "admin" && nextRole !== "admin";
    if (isDestructive) {
      const ok = window.confirm(
        `Remove admin from ${email}? They'll lose access to /admin/* and user management.`,
      );
      if (!ok) return;
    }

    // Self-demote from admin: also confirm (separate copy).
    if (isSelf && optimisticRole === "admin" && nextRole !== "admin") {
      const ok = window.confirm(
        "You're demoting yourself from admin. You'll lose admin access immediately. Continue?",
      );
      if (!ok) return;
    }

    setError(null);
    const previous = optimisticRole;
    setOptimisticRole(nextRole);

    startTransition(async () => {
      const result = await setUserRole(userId, nextRole);
      if (!result.ok) {
        // Roll back the optimistic state and show the server message.
        setOptimisticRole(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div
        role="radiogroup"
        aria-label={`Role for ${email}`}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-dark2/40 p-0.5"
      >
        {ROLES.map((role) => {
          const isCurrent = role === optimisticRole;
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              aria-label={`${ROLE_LABELS[role]} — ${ROLE_DESCRIPTIONS[role]}`}
              title={ROLE_DESCRIPTIONS[role]}
              disabled={isPending}
              onClick={() => attemptChange(role)}
              className={
                isCurrent
                  ? `inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] shadow-sm transition-all duration-150 ${ROLE_TONES[role]}`
                  : "inline-flex items-center rounded-full border border-transparent px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 transition-colors hover:bg-dark3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              {ROLE_LABELS[role]}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="max-w-[20rem] text-right text-xs text-danger">{error}</p>
      )}
      {isPending && !error && (
        <p className="text-right text-xs text-muted-foreground">Saving…</p>
      )}
    </div>
  );
}
