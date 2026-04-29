// POST /api/telemetry — client batch ingestion. Up to 50 events.
// Trusts the client-side TypeScript map for event name validity (no
// server-side enum) so stale clients don't break the route. PII rules
// are enforced at code-review, not at runtime.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/errors/api-error";
import { withLogging } from "@/lib/logging/with-logging";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const EventSchema = z.object({
  name: z.string().min(1).max(120),
  properties: z.record(z.string(), z.unknown()).optional(),
  application_id: z.string().uuid().optional(),
  request_id: z.string().uuid().optional(),
  session_id: z.string().max(80).optional(),
  timestamp: z.string().datetime().optional(),
});
const BatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(50),
});

export const POST = withLogging(
  "telemetry.ingest",
  async (req: NextRequest, ctx) => {
    const userClient = await createClient();
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData.user?.id ?? null;
    if (userId) ctx.user_id = userId;

    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      throw new ApiError("invalid_request");
    }
    const parsed = BatchSchema.safeParse(bodyJson);
    if (!parsed.success) throw new ApiError("invalid_request");

    const service = createServiceClient();
    const rows = parsed.data.events.map((e) => ({
      user_id: userId,
      application_id: e.application_id ?? null,
      request_id: e.request_id ?? null,
      session_id: e.session_id ?? null,
      name: e.name,
      properties: e.properties ?? null,
      created_at: e.timestamp ?? new Date().toISOString(),
    }));
    const { error } = await service.from("telemetry_events").insert(rows);
    if (error) throw new ApiError("database_error", error.message);

    return NextResponse.json({ accepted: rows.length });
  },
);
