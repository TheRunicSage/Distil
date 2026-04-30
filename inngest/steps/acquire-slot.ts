// Acquire-slot: confirms this application is the front-of-queue item
// for its user (FIFO by queue_position over status in queued/paused).
// If not, returns { atFrontOfQueue: false, actualFrontId } and the
// orchestrator re-fires `application/generate.requested` for the actual
// front so the queue self-heals. Inngest concurrency:1-per-user is the
// outer gate, so re-firing for a row that already has a run in flight
// is a no-op.
//
// Decision Log step 10 DP-B: Option A — sentinel return, function
// branches. No throw, so onFailure is reserved for real errors.
//
// Self-healing rationale: the original design relied on
// `triggerNextInQueue` (fires on `generation.completed`) to advance the
// queue. That fails when the row at the front never had a live function
// run for it (Inngest dev was off at submit time, registration missing,
// kill switch flipped, etc.). The original `generate.requested` event
// is gone; no completion will ever fire; the queue dead-locks. Returning
// the actual front id and having the orchestrator re-fire makes any
// stuck submission self-recover within one Inngest tick.

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type AcquireSlotResult = {
  atFrontOfQueue: boolean;
  actualFrontId: string | null;
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
    return { atFrontOfQueue: false, actualFrontId: null };
  }

  const frontId = data[0].id as string;
  return {
    atFrontOfQueue: frontId === applicationId,
    actualFrontId: frontId,
  };
}
