// GET /api/applications/[id]/events — server-sent events stream of
// generation phases. Phase shape (locked):
//   { phase, application_id, timestamp, payload? }
//
// Replay: if the client supplies Last-Event-ID (or ?lastEventId=), we
// fetch generation_events with id > lastEventId and emit them before
// switching to live polling.
//
// Decision Log step 11 DP-A (Option B): 15-second heartbeat
// (SSE comment ":\n\n") to keep the connection alive within Vercel's
// request window and intermediary idle timeouts. The 5-second client
// polling fallback (spec §6.7) handles genuine drops.
//
// We poll generation_events on a 1-second tick and emit any rows newer
// than the last sent id. The stream closes when a 'finalized' phase
// is observed or the application's status is in a terminal set.

import "server-only";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const HEARTBEAT_MS = 15_000;
const POLL_MS = 1_000;
const MAX_STREAM_MS = 23_000; // stay just under Vercel's 25s safety floor

const TERMINAL_STATUSES = new Set([
  "success",
  "insufficient_input",
  "abandoned",
  "error",
  "cancelled",
]);

export async function GET(req: NextRequest, ctxArg: RouteContext) {
  const { id: applicationId } = await ctxArg.params;

  const userClient = await createClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) {
    return new Response(
      JSON.stringify({
        error: { code: "not_authenticated", message: "Sign in to continue." },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Ownership check via the user-scoped client (RLS enforced).
  const { data: app } = await userClient
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) {
    return new Response(
      JSON.stringify({
        error: {
          code: "application_not_found",
          message: "That application could not be found.",
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const lastEventIdHeader =
    req.headers.get("Last-Event-ID") ??
    req.nextUrl.searchParams.get("lastEventId");

  const service = createServiceClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const startedAt = Date.now();
      let lastSeenCreatedAt = "1970-01-01T00:00:00Z";
      let lastSeenId = "00000000-0000-0000-0000-000000000000";
      let timer: NodeJS.Timeout | null = null;
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let pollTimer: NodeJS.Timeout | null = null;

      const safeClose = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearInterval(pollTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const writeRaw = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          safeClose();
        }
      };

      const writeEvent = (row: {
        id: string;
        created_at: string;
        phase: string;
        payload: unknown;
      }) => {
        const data = JSON.stringify({
          phase: row.phase,
          application_id: applicationId,
          timestamp: row.created_at,
          payload: row.payload ?? undefined,
        });
        writeRaw(`id: ${row.id}\nevent: phase\ndata: ${data}\n\n`);
        lastSeenId = row.id;
        lastSeenCreatedAt = row.created_at;
        if (row.phase === "finalized") {
          safeClose();
        }
      };

      // Replay: rows with id > Last-Event-ID. Postgres uuid v4 is not
      // monotonic, so we prefer ordering by created_at and the row's
      // own id as a stable tiebreaker. If a Last-Event-ID is supplied
      // we resolve its created_at first to avoid replaying it.
      if (lastEventIdHeader) {
        const { data: anchor } = await service
          .from("generation_events")
          .select("created_at")
          .eq("id", lastEventIdHeader)
          .maybeSingle();
        if (anchor) {
          lastSeenCreatedAt = anchor.created_at;
          lastSeenId = lastEventIdHeader;
        }
      }

      const replay = await service
        .from("generation_events")
        .select("id, created_at, phase, payload")
        .eq("application_id", applicationId)
        .gt("created_at", lastSeenCreatedAt)
        .order("created_at", { ascending: true });
      for (const row of replay.data ?? []) {
        if (closed) break;
        writeEvent(row);
      }
      if (closed) return;

      // If the application is already in a terminal state and we've
      // replayed everything, no live stream is needed.
      if (TERMINAL_STATUSES.has(app.status)) {
        safeClose();
        return;
      }

      heartbeatTimer = setInterval(() => writeRaw(":\n\n"), HEARTBEAT_MS);
      writeRaw(":\n\n"); // initial heartbeat flushes headers immediately

      pollTimer = setInterval(async () => {
        if (closed) return;
        const { data: rows } = await service
          .from("generation_events")
          .select("id, created_at, phase, payload")
          .eq("application_id", applicationId)
          .gt("created_at", lastSeenCreatedAt)
          .order("created_at", { ascending: true });
        for (const row of rows ?? []) {
          writeEvent(row);
          if (closed) return;
        }
      }, POLL_MS);

      timer = setTimeout(safeClose, MAX_STREAM_MS);

      // Handle client disconnect cleanly.
      req.signal.addEventListener("abort", safeClose);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
