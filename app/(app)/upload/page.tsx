// Upload screen. Server-renders the existing master CV state, embeds
// the upload form (client component) for the actual POST.

import { redirect } from "next/navigation";
import { ProTip } from "@/components/app/ProTip";
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

  // First upload → drop the user straight into /application/new with the
  // CV already wired up; replacements (reached from /settings) bounce
  // back to settings so the user keeps the context they came from.
  const isFirstUpload = !existing;
  const redirectTo = isFirstUpload ? "/application/new" : "/settings";
  const successToast = isFirstUpload
    ? "Master CV uploaded. Now paste a job description."
    : "Master CV replaced.";

  return (
    <div className="space-y-10">
      <header className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange">
          {isFirstUpload ? "Step 1 of 2" : "Replace master CV"}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-light leading-[1.15] tracking-tight text-text">
          {isFirstUpload
            ? "Start with everything you have."
            : "Swap in a new master CV."}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          {isFirstUpload
            ? "Upload your master CV with all your experience, skills, and accomplishments. Don't hold back — the more we know, the sharper the result."
            : "Replacing the CV won't affect applications already in the queue. They keep using the snapshot from when they were submitted."}
        </p>
      </header>

      {existing && (
        <div className="rounded-2xl border border-orange/30 bg-[var(--color-orange-subtle)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-orange">
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
            the queue. They keep using the snapshot from when they were
            submitted.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-dark2/60 p-7 backdrop-blur-sm">
        <h2 className="font-serif text-xl font-normal text-text">
          {existing ? "Replace master CV" : "Upload your master CV"}
        </h2>
        <div className="mt-5">
          <UploadForm redirectTo={redirectTo} successToast={successToast} />
        </div>
        <ProTip className="mt-6">
          {isFirstUpload
            ? "Include every project, certification, and skill you can think of. We'll pick the ones that matter for each role."
            : "Replacements supersede the previous CV; queued applications keep their original snapshot."}
        </ProTip>
      </section>
    </div>
  );
}
