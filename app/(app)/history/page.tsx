// History page. Server-fetches up to 200 rows; client component does
// effective-status filter + free-text search in memory.
//
// Visibility rule: only applications that actually reached the LLM
// are listed (started_at is NOT NULL). Pure-queued or pre-LLM-abandoned
// rows are excluded so exploratory submissions that never spent any
// model time don't pollute the user's history.
//
// Rows are grouped into chains (groupIntoChains) so a retry doesn't
// double-list the original.

import { redirect } from "next/navigation";
import { HistoryList } from "@/components/history/HistoryList";
import { groupIntoChains } from "@/lib/applications/chains";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationOutput } from "@/lib/llm/output-schema";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, status, parent_application_id, created_at, completed_at, llm_response_json",
    )
    .not("started_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const flat = (rows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    parent_application_id: r.parent_application_id,
    created_at: r.created_at,
    completed_at: r.completed_at,
    llm_response_json: r.llm_response_json as ApplicationOutput | null,
  }));
  const chains = groupIntoChains(flat);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">History</p>
        <h1 className="heading-display mt-5">All your applications.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Newest first. Retries are nested under the original generation.
        </p>
      </header>

      <HistoryList chains={chains} />
    </div>
  );
}
