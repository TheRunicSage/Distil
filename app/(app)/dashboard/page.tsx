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
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-text">Welcome back.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tailor your CV and cover letter for a specific role.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-dark3 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            Master CV
          </p>
          {hasCv ? (
            <>
              <p className="mt-3 text-sm text-text">
                On file as {cvRes.data?.mime_type === "application/pdf"
                  ? "PDF"
                  : "DOCX"}{" "}
                ·{" "}
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
                className="mt-4 inline-block text-sm text-orange hover:text-orange-light"
              >
                Replace master CV →
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-text">No master CV uploaded.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload one PDF or DOCX (≤3MB) to start tailoring.
              </p>
              <Link
                href="/upload"
                className="mt-4 inline-block rounded-sm bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light"
              >
                Upload CV
              </Link>
            </>
          )}
        </div>

        <div className="rounded-lg border border-border bg-dark3 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            New application
          </p>
          <p className="mt-3 text-sm text-text">
            Paste a job description, get a tailored CV and cover letter.
          </p>
          {hasCv ? (
            <Link
              href="/application/new"
              className="mt-4 inline-block rounded-sm bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light"
            >
              Tailor a new application
            </Link>
          ) : (
            <span className="mt-4 inline-block cursor-not-allowed rounded-sm border border-border bg-dark4 px-4 py-2 text-sm font-medium text-muted-foreground">
              Upload a CV first
            </span>
          )}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
            Recent
          </h2>
          <Link
            href="/history"
            className="text-xs text-muted-foreground hover:text-text"
          >
            View all →
          </Link>
        </div>
        {apps.length === 0 ? (
          <div className="rounded-lg border border-border bg-dark3 p-12 text-center text-muted-foreground">
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
                    className="flex items-center justify-between rounded-sm border border-border bg-dark3 px-4 py-3 transition-colors hover:bg-dark4"
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
