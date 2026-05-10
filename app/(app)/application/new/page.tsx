// New application screen. Server-side gate: a master CV must exist;
// if not, redirect to /upload. Form is a client component so we can
// run the 3-second debounce + word-count UI.

import { redirect } from "next/navigation";
import { NewApplicationForm } from "@/components/application/NewApplicationForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: cv } = await supabase
    .from("master_cvs")
    .select("id")
    .eq("user_id", userData.user.id)
    .is("superseded_at", null)
    .maybeSingle();
  if (!cv) redirect("/upload");

  return (
    <div className="space-y-8">
      <header className="text-center">
        <p className="eyebrow">New application</p>
        <h1 className="heading-display mt-3">
          Now, the role you&apos;re after.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          Paste the full job description. Title, company, every detail from
          the listing. We&apos;ll reverse-engineer exactly what they&apos;re
          looking for.
        </p>
      </header>

      <NewApplicationForm />
    </div>
  );
}
