// Dashboard. Single job: show the user where they are and what to do
// next. Master CV management lives in /settings, not here.
//
// Three states:
//   1. No CV → full-width "upload to get started" card.
//   2. Has CV, has any history → "In progress" panel + "Recent" panel.
//   3. Has CV, no history → "Tailor your first application" CTA.
//
// Both panels render *chains* (groupIntoChains): a retry doesn't
// double-list the original. Live = queued/paused/running/rendering.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { ChainCard } from "@/components/app/ChainCard";
import {
  groupIntoChains,
  type FlatRow,
} from "@/lib/applications/chains";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationOutput } from "@/lib/llm/output-schema";

export const dynamic = "force-dynamic";

const LIVE_STATUSES = ["queued", "paused", "running", "rendering"] as const;
const RECENT_LIMIT = 8;

type DbRow = {
  id: string;
  status: string;
  parent_application_id: string | null;
  created_at: string;
  completed_at: string | null;
  llm_response_json: ApplicationOutput | null;
};

function toFlat(rows: DbRow[]): FlatRow[] {
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    parent_application_id: r.parent_application_id,
    created_at: r.created_at,
    completed_at: r.completed_at,
    llm_response_json: r.llm_response_json,
  }));
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [cvRes, liveRes, recentRes] = await Promise.all([
    supabase
      .from("master_cvs")
      .select("id")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle(),
    supabase
      .from("applications")
      .select(
        "id, status, parent_application_id, created_at, completed_at, llm_response_json",
      )
      .in("status", LIVE_STATUSES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("applications")
      .select(
        "id, status, parent_application_id, created_at, completed_at, llm_response_json",
      )
      .not("started_at", "is", null)
      .not("status", "in", `(${LIVE_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const hasCv = Boolean(cvRes.data);
  const liveChains = groupIntoChains(toFlat(liveRes.data ?? []));
  const recentChains = groupIntoChains(toFlat(recentRes.data ?? [])).slice(
    0,
    RECENT_LIMIT,
  );
  const hasAnyHistory = liveChains.length > 0 || recentChains.length > 0;

  return (
    <div className="space-y-12">
      <header className="text-center">
        <p className="eyebrow">Welcome back</p>
        <h1 className="heading-display mt-5">Pick up where you left off.</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Your CV, stripped to its sharpest form. ATS ready, recruiter approved.
        </p>
      </header>

      {!hasCv && (
        <section className="surface-card text-center">
          <p className="eyebrow">Get started</p>
          <h2 className="heading-section mt-5">
            Upload your master CV first.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground">
            One PDF or DOCX, up to 3MB. We&apos;ll use it as the source of truth
            for every tailored application.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/upload" className="btn-primary">
              Upload CV
            </Link>
          </div>
        </section>
      )}

      {hasCv && !hasAnyHistory && (
        <section className="surface-card text-center">
          <p className="eyebrow">Ready</p>
          <h2 className="heading-section mt-5">
            Tailor your first application.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground">
            Paste a job description. Get a tailored CV and cover letter, both
            matched to the role.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/application/new" className="btn-primary">
              Tailor a new application
            </Link>
          </div>
        </section>
      )}

      {hasCv && liveChains.length > 0 && (
        <section>
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="eyebrow-muted">In progress</h2>
            <span className="text-meta">
              {liveChains.length}{" "}
              {liveChains.length === 1 ? "application" : "applications"}
            </span>
          </div>
          <ul className="space-y-3">
            {liveChains.map((c) => (
              <li key={c.rootId}>
                <ChainCard chain={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasCv && recentChains.length > 0 && (
        <section>
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="eyebrow-muted">Recent</h2>
            <Link href="/history" className="btn-pill">
              View all
              <ArrowRightIcon size={14} aria-hidden />
            </Link>
          </div>
          <ul className="space-y-3">
            {recentChains.map((c) => (
              <li key={c.rootId}>
                <ChainCard chain={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
