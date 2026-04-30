"use server";

// signIn Server Action. Generic error on failure (no user enumeration) per
// app_handoff §6.4. Returns a result rather than throwing so the form can
// render the message inline; redirect on success goes through next/navigation.

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SignInInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignInResult = { error: string } | undefined;

export async function signIn(
  _prevState: SignInResult,
  formData: FormData,
): Promise<SignInResult> {
  const parsed = SignInInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error, data: signInData } =
    await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Generic message — never reveal whether the email exists.
    return { error: "Those credentials didn't work. Try again." };
  }

  // First-session routing: a user with no master CV on file lands on
  // /upload, since uploading the CV is the only thing they can do
  // before the rest of the app is meaningful. Returning users with a
  // CV go to /dashboard as before.
  const userId = signInData.user?.id;
  if (userId) {
    const { data: cv } = await supabase
      .from("master_cvs")
      .select("id")
      .eq("user_id", userId)
      .is("superseded_at", null)
      .maybeSingle();
    if (!cv) redirect("/upload");
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
