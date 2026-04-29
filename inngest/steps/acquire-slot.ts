// Acquire-slot: confirms this application is the front-of-queue item
// for its user (FIFO by queue_position over status in queued/paused).
// If not, returns { atFrontOfQueue: false } and the orchestrator exits
// cleanly without touching status. Inngest concurrency:1-per-user is
// the outer gate; this step exists to keep ordering correct when
// paused→queued resumption happens out of arrival order.
//
// Decision Log step 10 DP-B: Option A — sentinel return, function
// branches. No throw, so onFailure is reserved for real errors.

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type AcquireSlotResult = {
  atFrontOfQueue: boolean;
};

export async function checkSlot(
  applicationId: string,
  userId: string,
): Promise<AcquireSlotResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("applications")
    .select("id, queue_position")
    .eq("user_id", userId)
    .in("status", ["queued", "paused"])
    .order("queue_position", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    // Nothing queued for this user, or the row was already advanced
    // out of queued/paused. Either way, this trigger is stale.
    return { atFrontOfQueue: false };
  }

  return { atFrontOfQueue: data[0].id === applicationId };
}
