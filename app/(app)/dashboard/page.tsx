// Dashboard. Landing page after sign-in. Three jobs:
//   1. Show whether a master CV is on file (and prompt upload if not).
//   2. Provide the primary "Tailor a new application" CTA.
//   3. Surface recent applications so the user lands on the next obvious
//      action (continue, retry, abandon).

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  success: "bg-success/15 text-success border-success/25",
  queued: "bg-info/15 text-info border-info/25",
  paused: "bg-warn/15 text-warn border-warn/25",
  running: "bg-warn/15 text-warn border-warn/25",
  rendering: "bg-warn/15 text-warn border-warn/25",
  insufficient_input: "bg-warn/15 text-warn border-warn/25",
  abandoned: "bg-dim/15 text-muted-foreground border-border",
  cancelled: "bg-dim/15 text-muted-foreground border-border",
  error: "bg-danger/15 text-danger border-danger/25",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [cvRes, appsRes] = await Promise.all([
    supabase
      .from("master_cvs")
      .select("id, mime_type, file_size_bytes, created_at")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, status, attempt_number, created_at, completed_at")
      .not("started_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const hasCv = Boolean(cvRes.data);
  const apps = appsRes.data ?? [];

  return (
    <div className="space-y-12">
      <header className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange">
          Welcome back
        </p>
        <h1 className="mt-3 font-serif text-4xl font-light leading-[1.15] tracking-tight text-text">
          Pick up where you left off.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your CV, stripped to its sharpest form. ATS ready, recruiter approved.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-dark2/60 p-7 backdrop-blur-sm transition-colors hover:border-orange/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-orange">
            Master CV
          </p>
          {hasCv ? (
            <>
              <p className="mt-4 text-[15px] text-text">
                On file as{" "}
                {cvRes.data?.mime_type === "application/pdf" ? "PDF" : "DOCX"} ·{" "}
                {Math.round((cvRes.data?.file_size_bytes ?? 0) / 1024)} KB
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Uploaded{" "}
                {new Date(cvRes.data?.created_at ?? "").toLocaleDateString(
                  "en-NZ",
                  { timeZone: "Pacific/Auckland" },
                )}
                .
              </p>
              <Link
                href="/upload"
                className="mt-5 inline-block text-sm text-orange transition-colors hover:text-orange-light"
              >
                Replace master CV →
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 text-[15px] text-text">
                No master CV uploaded.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload one PDF or DOCX (≤3MB) to start tailoring.
              </p>
              <Link
                href="/upload"
                className="mt-5 inline-block rounded-xl bg-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-light"
              >
                Upload CV
              </Link>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-dark2/60 p-7 backdrop-blur-sm transition-colors hover:border-orange/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-orange">
            New application
          </p>
          <p className="mt-4 text-[15px] text-text">
            Paste a job description. Get a tailored CV and cover letter, both matched to the role.
          </p>
          {hasCv ? (
            <Link
              href="/application/new"
              className="mt-5 inline-block rounded-xl bg-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-light"
            >
              Tailor a new application
            </Link>
          ) : (
            <span className="mt-5 inline-block cursor-not-allowed rounded-xl border border-border bg-dark4 px-5 py-2.5 text-sm font-medium text-muted-foreground">
              Upload a CV first
            </span>
          )}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Recent
          </h2>
          <Link
            href="/history"
            className="text-xs text-muted-foreground transition-colors hover:text-text"
          >
            View all →
          </Link>
        </div>
        {apps.length === 0 ? (
          <div className="rounded-2xl border border-border bg-dark2/60 p-12 text-center text-sm text-muted-foreground backdrop-blur-sm">
            Your tailored applications will show up here.
          </div>
        ) : (
          <ul className="space-y-2">
            {apps.map((app) => {
              const tone =
                STATUS_TONE[app.status] ??
                "bg-dim/15 text-muted-foreground border-border";
              return (
                <li key={app.id}>
                  <Link
                    href={`/application/${app.id}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-dark2/60 px-4 py-3 backdrop-blur-sm transition-colors hover:border-orange/40 hover:bg-dark3/80"
                  >
                    <span className="font-mono text-xs text-text">
                      {app.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      attempt {app.attempt_number}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}
                    >
                      {app.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(app.created_at).toLocaleString("en-NZ", {
                        timeZone: "Pacific/Auckland",
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
