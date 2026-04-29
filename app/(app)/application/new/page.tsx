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
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-text"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-text">
          New application
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll research the company, calibrate to seniority, and
          tailor the CV and cover letter.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-dark3 p-6">
        <NewApplicationForm />
      </section>
    </div>
  );
}
