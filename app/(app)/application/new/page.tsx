// New application screen. Server-side gate: a master CV must exist;
// if not, redirect to /upload. Form is a client component so we can
// run the 3-second debounce + word-count UI.

import Link from "next/link";
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
    <div className="space-y-10">
      <header className="text-center">
        <Link
          href="/dashboard"
          className="inline-block text-xs text-muted-foreground transition-colors hover:text-text"
        >
          ← Back to Dashboard
        </Link>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange">
          Step 2 of 2
        </p>
        <h1 className="mt-3 font-serif text-4xl font-light leading-[1.15] tracking-tight text-text">
          Now, the role you&apos;re after.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Paste the full job description. Include the title, company,
          and every detail from the listing. We&apos;ll reverse-engineer
          exactly what they&apos;re looking for.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-dark2/60 p-7 backdrop-blur-sm">
        <NewApplicationForm />
      </section>
    </div>
  );
}
