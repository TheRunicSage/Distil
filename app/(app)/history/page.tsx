// History page. Server-fetches up to 200 rows; client component does
// status-pill filter + free-text search in memory.
//
// Visibility rule: only applications that actually reached the LLM are
// listed (started_at is NOT NULL). Pure-queued or pre-LLM-abandoned
// rows are excluded so exploratory submissions that never spent any
// model time don't pollute the user's history.

import { redirect } from "next/navigation";
import { HistoryList } from "@/components/history/HistoryList";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, status, attempt_number, parent_application_id, created_at, completed_at",
    )
    .not("started_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every application you&apos;ve submitted, newest first.
        </p>
      </header>

      <HistoryList rows={rows ?? []} />
    </div>
  );
}
