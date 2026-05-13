// Admin gate. Returns the authenticated user if profiles.role is
// 'admin'; throws not_authenticated / not_admin otherwise. Used by
// every route under /api/admin and the admin pages.
//
// Migration 0006_user_roles.sql replaced the legacy boolean is_admin
// with a text role column. See lib/auth/roles.ts for the single
// source of truth on roles and capabilities.

import "server-only";
import { ApiError } from "@/lib/errors/api-error";
import { isAdmin, normaliseRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type AdminUser = { id: string; email: string | null };

export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new ApiError("not_authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!isAdmin(normaliseRole(profile?.role))) throw new ApiError("not_admin");

  return { id: userData.user.id, email: userData.user.email ?? null };
}
