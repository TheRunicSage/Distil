// Admin gate. Returns the authenticated user if profiles.is_admin is
// true; throws not_authenticated / not_admin otherwise. Used by every
// route under /api/admin and the admin pages.

import "server-only";
import { ApiError } from "@/lib/errors/api-error";
import { createClient } from "@/lib/supabase/server";

export type AdminUser = { id: string; email: string | null };

export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new ApiError("not_authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) throw new ApiError("not_admin");

  return { id: userData.user.id, email: userData.user.email ?? null };
}
