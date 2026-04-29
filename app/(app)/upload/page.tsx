// Upload screen. Server-renders the existing master CV state, embeds
// the upload form (client component) for the actual POST.

import { redirect } from "next/navigation";
import { UploadForm } from "@/components/upload/UploadForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: existing } = await supabase
    .from("master_cvs")
    .select("id, mime_type, file_size_bytes, created_at")
    .eq("user_id", userData.user.id)
    .is("superseded_at", null)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text">Master CV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One CV on file at a time. Each tailored application snapshots
          the current version.
        </p>
      </header>

      {existing && (
        <div className="rounded-lg border border-border bg-dark3 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            Currently on file
          </p>
          <p className="mt-2 text-sm text-text">
            {existing.mime_type === "application/pdf" ? "PDF" : "DOCX"} ·{" "}
            {Math.round(existing.file_size_bytes / 1024)} KB · uploaded{" "}
            {new Date(existing.created_at).toLocaleDateString("en-NZ", {
              timeZone: "Pacific/Auckland",
            })}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Replacing the CV won&apos;t affect applications already in
            the queue — they keep using the snapshot from when they
            were submitted.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-border bg-dark3 p-6">
        <h2 className="text-base font-semibold text-text">
          {existing ? "Replace master CV" : "Upload master CV"}
        </h2>
        <div className="mt-4">
          <UploadForm />
        </div>
      </section>
    </div>
  );
}
