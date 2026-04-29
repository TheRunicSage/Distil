// withLogging — outer wrapper for every API route handler. Generates a
// request_id, sets Sentry tag, catches ApiError into the JSON envelope,
// wraps anything else as `internal_error` 500, writes a request_logs row
// fire-and-forget, and stamps `X-Request-Id` on the response.
//
// Decision Log [7]: wrapper exposes a mutable `ctx` object the handler
// populates as it learns identifiers (user_id, application_id, replayed).
// The wrapper reads ctx in the finally block when writing request_logs.

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@/lib/errors/api-error";
import { sanitiseErrorMessage } from "@/lib/errors/sanitise";
import { createServiceClient } from "@/lib/supabase/service";

export type RouteContext = {
  request_id: string;
  user_id?: string;
  application_id?: string;
  replayed?: boolean;
  /** Free-form metadata persisted to request_logs.metadata. */
  metadata?: Record<string, unknown>;
};

type RouteHandler = (
  req: NextRequest,
  context: RouteContext,
) => Promise<NextResponse> | Promise<Response>;

export function withLogging(
  name: string,
  handler: RouteHandler,
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest): Promise<Response> => {
    const request_id = crypto.randomUUID();
    const ctx: RouteContext = { request_id };
    const startedAt = Date.now();

    Sentry.getCurrentScope().setTag("request_id", request_id);
    Sentry.getCurrentScope().setTag("route", name);

    let response: Response;
    let status: "ok" | "error" = "ok";
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    try {
      response = await handler(req, ctx);
      if (response.status >= 400) {
        status = "error";
      }
    } catch (err) {
      if (err instanceof ApiError) {
        status = "error";
        errorCode = err.code;
        errorMessage = sanitiseErrorMessage(err.message);
        // Spec §6.10: report 5xx to Sentry, never 4xx.
        if (err.httpStatus >= 500) {
          Sentry.captureException(err, {
            tags: { request_id, route: name, error_code: err.code },
          });
        }
        response = NextResponse.json(
          { error: { code: err.code, message: err.message } },
          { status: err.httpStatus },
        );
      } else {
        status = "error";
        errorCode = "internal_error";
        errorMessage = sanitiseErrorMessage(err);
        Sentry.captureException(err, {
          tags: { request_id, route: name, error_code: "internal_error" },
        });
        response = NextResponse.json(
          {
            error: {
              code: "internal_error",
              message:
                "Something went wrong on our side. Please try again.",
            },
          },
          { status: 500 },
        );
      }
    }

    response.headers.set("X-Request-Id", request_id);

    const duration_ms = Date.now() - startedAt;
    void writeLog({
      request_id,
      name,
      duration_ms,
      status,
      errorCode,
      errorMessage,
      ctx,
    });

    return response;
  };
}

type LogPayload = {
  request_id: string;
  name: string;
  duration_ms: number;
  status: "ok" | "error";
  errorCode: string | null;
  errorMessage: string | null;
  ctx: RouteContext;
};

async function writeLog(payload: LogPayload): Promise<void> {
  try {
    const supabase = createServiceClient();
    const metadata: Record<string, unknown> = {
      ...(payload.ctx.metadata ?? {}),
    };
    if (payload.ctx.replayed) metadata.replayed = true;

    await supabase.from("request_logs").insert({
      id: payload.request_id,
      user_id: payload.ctx.user_id ?? null,
      application_id: payload.ctx.application_id ?? null,
      source: "api_route",
      name: payload.name,
      duration_ms: payload.duration_ms,
      status: payload.status,
      error_code: payload.errorCode,
      error_message: payload.errorMessage,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch {
    // Fire-and-forget: never let logging failure break a response.
  }
}
