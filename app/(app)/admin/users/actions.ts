"use server";

// Server actions for the admin users page. Currently one action:
// setUserRole — change a user's role with a last-admin guard so
// the system can never end up with zero admins. See CLAUDE.md
// Decision Log [14] 2026-05-13.
//
// All actions are gated on requireAdmin() — non-admins get a thrown
// ApiError that bubbles up to the form-action error path. The
// admin/users page is itself gated by app/(app)/admin/layout.tsx
// which calls requireAdmin() on every render, so this is
// belt-and-braces.

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/errors/api-error";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isRole, type Role } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/service";

export type SetUserRoleResult =
  | { ok: true; role: Role }
  | { ok: false; error: string };

export async function setUserRole(
  targetUserId: string,
  nextRole: string,
): Promise<SetUserRoleResult> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Not authorised." };
  }

  if (!isRole(nextRole)) {
    return { ok: false, error: `Unknown role: ${nextRole}` };
  }

  if (typeof targetUserId !== "string" || targetUserId.trim() === "") {
    return { ok: false, error: "Missing target user id." };
  }

  const service = createServiceClient();

  // Last-admin guard: if the target is currently an admin AND the
  // new role is not admin, count remaining admins. If demoting this
  // user would drop the total to zero, refuse.
  const { data: currentProfile, error: profileErr } = await service
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .maybeSingle();
  if (profileErr || !currentProfile) {
    return { ok: false, error: "Could not load that user." };
  }
  const currentRole = currentProfile.role as Role;

  if (currentRole === nextRole) {
    // No-op. Treated as success so the UI doesn't surface an error
    // when the picker is clicked on the current role.
    return { ok: true, role: nextRole };
  }

  if (currentRole === "admin" && nextRole !== "admin") {
    const { count, error: countErr } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countErr) {
      return { ok: false, error: "Could not verify admin count." };
    }
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error:
          "Cannot demote the last admin. Promote another user to admin first.",
      };
    }
  }

  const { error: updateErr } = await service
    .from("profiles")
    .update({ role: nextRole })
    .eq("id", targetUserId);
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  // Refresh the admin/users page so the new role chip surfaces.
  revalidatePath("/admin/users");
  return { ok: true, role: nextRole };
}
