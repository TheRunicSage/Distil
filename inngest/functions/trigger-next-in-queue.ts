// Listens for 'application/generation.completed' and fires
// 'application/generate.requested' for the next queued item belonging
// to the same user. The acquire-slot step in generateApplication is the
// real gate; this function just nudges Inngest to start the next run.
//
// Concurrency: 1 per user, so two completions arriving for the same
// user can't double-trigger.

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

export const triggerNextInQueue = inngest.createFunction(
  {
    id: "trigger-next-in-queue",
    name: "Trigger Next In Queue",
    concurrency: { key: "event.data.user_id", limit: 1 },
    triggers: [{ event: "application/generation.completed" }],
  },
  async ({ event, step }) => {
    const { user_id } = event.data as { user_id: string };

    const next = await step.run("find-next", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("applications")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "queued")
        .order("queue_position", { ascending: true })
        .limit(1);
      if (error || !data || data.length === 0) return null;
      return data[0].id as string;
    });

    if (!next) return { triggered: false };

    await step.sendEvent("send-generate-requested", {
      name: "application/generate.requested",
      data: { application_id: next, user_id },
    });

    return { triggered: true, application_id: next };
  },
);
