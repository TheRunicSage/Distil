// Daily 02:45 NZT (14:45 UTC). Delete idempotency_keys rows past
// their expires_at (10-minute TTL on insert).

import "server-only";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

export const sweepIdempotencyKeys = inngest.createFunction(
  {
    id: "sweep-idempotency-keys",
    name: "Sweep Idempotency Keys",
    triggers: [{ cron: "45 14 * * *" }],
  },
  async () => {
    return withCronLog("sweep-idempotency-keys", async () => {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from("idempotency_keys")
        .delete()
        .lt("expires_at", new Date().toISOString());
      return { error: error?.message ?? null };
    });
  },
);
