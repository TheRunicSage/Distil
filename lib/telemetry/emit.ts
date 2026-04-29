// Server-side telemetry emission. Writes directly to telemetry_events via
// the service-role client. Fire-and-forget; never blocks a response.

import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

import type {
  TelemetryEventMap,
  TelemetryEventName,
} from "./events";

type EmitContext = {
  user_id?: string;
  application_id?: string;
  request_id?: string;
  session_id?: string;
};

export async function emitTelemetry<K extends TelemetryEventName>(
  name: K,
  properties: TelemetryEventMap[K],
  context: EmitContext = {},
): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("telemetry_events").insert({
      user_id: context.user_id ?? null,
      application_id: context.application_id ?? null,
      request_id: context.request_id ?? null,
      session_id: context.session_id ?? null,
      name,
      properties: properties as unknown as Record<string, unknown>,
    });
  } catch {
    // Telemetry is fire-and-forget. Never throw.
  }
}
