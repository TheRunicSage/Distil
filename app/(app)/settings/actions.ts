"use server";

// Account-deletion Server Action. Spec mentions account deletion as a
// deferred feature; delivering it now per user request.
//
// Confirmation: caller must submit the user's exact email address.
// Without that double-typing the destructive action is too easy to fire
// by accident.
//
// Mechanism:
//   1. Verify the typed email matches the signed-in user's email.
//   2. Hash the email and insert into account_deletions for audit.
//   3. Call supabase.auth.admin.deleteUser(userId) via the service-role
//      client. Schema FKs cascade to profiles, master_cvs, applications,
//      generation_events, token_usage, idempotency_keys; SET NULL on
//      request_logs and telemetry_events so operational logs survive.
//   4. Sign out the browser session and redirect to /login.

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type DeleteAccountResult = { error: string } | undefined;

export async function deleteAccount(
  _prev: DeleteAccountResult,
  formData: FormData,
): Promise<DeleteAccountResult> {
  const typed = String(formData.get("confirm_email") ?? "")
    .trim()
    .toLowerCase();
  if (!typed) {
    return { error: "Type your email to confirm." };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "Session expired. Sign in and try again." };
  }
  const sessionEmail = (userData.user.email ?? "").trim().toLowerCase();
  if (typed !== sessionEmail) {
    return { error: "Email doesn't match the signed-in account." };
  }

  const userId = userData.user.id;
  const hashedEmail = createHash("sha256").update(sessionEmail).digest("hex");

  const service = createServiceClient();

  await service
    .from("account_deletions")
    .insert({ hashed_email: hashedEmail, reason: "user_initiated" });

  const { error: deleteError } =
    await service.auth.admin.deleteUser(userId);
  if (deleteError) {
    return {
      error:
        "Couldn't complete deletion. Try again, or contact support if it persists.",
    };
  }

  await supabase.auth.signOut();
  redirect("/login");
}
