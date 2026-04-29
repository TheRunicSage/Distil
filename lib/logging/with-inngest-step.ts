// Inngest-step counterpart to withLogging. Wraps a step.run callback so
// every step gets a request_logs row with source='inngest_step', plus
// proper duration/status/error_code/error_message and any caller-supplied
// metadata. ApiError throws are sanitised the same way as in routes.
//
// Decision Log step 10 DP-C: Option A — central helper used by every
// Inngest step body.
//
// Usage:
//   const ctx = await withInngestStep(step, 'load-context',
//     { application_id, user_id }, async () => { ... return ctx });
//
// The handler's return value is forwarded unchanged. Failures rethrow
// after the row is written so Inngest's own retry / onFailure machinery
// still applies.

import "server-only";
import * as Sentry from "@sentry/nextjs";

import { ApiError } from "@/lib/errors/api-error";
import { sanitiseErrorMessage } from "@/lib/errors/sanitise";
import { createServiceClient } from "@/lib/supabase/service";

// Inngest's step.run is heavily generic (Jsonify-wrapped, conditional
// on void return, etc.). Typing StepLike against the precise shape
// fights TypeScript variance for no real gain — this wrapper is a
// pure pass-through. We accept the step value loosely and rely on the
// callsites' inferred types.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepLike = { run: (name: string, fn: () => any) => Promise<any> };

export type InngestStepContext = {
  user_id?: string;
  application_id?: string;
  metadata?: Record<string, unknown>;
};

export async function withInngestStep<T>(
  step: StepLike,
  name: string,
  ctx: InngestStepContext,
  fn: () => Promise<T> | T,
): Promise<T> {
  return step.run(name, async () => {
    const startedAt = Date.now();
    let status: "ok" | "error" = "ok";
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    try {
      const result = await fn();
      return result;
    } catch (err) {
      status = "error";
      if (err instanceof ApiError) {
        errorCode = err.code;
        errorMessage = sanitiseErrorMessage(err.message);
      } else {
        errorCode = "internal_error";
        errorMessage = sanitiseErrorMessage(err);
        Sentry.captureException(err, { tags: { inngest_step: name } });
      }
      throw err;
    } finally {
      const duration_ms = Date.now() - startedAt;
      void writeStepLog({
        name,
        duration_ms,
        status,
        errorCode,
        errorMessage,
        ctx,
      });
    }
  });
}

type StepLogPayload = {
  name: string;
  duration_ms: number;
  status: "ok" | "error";
  errorCode: string | null;
  errorMessage: string | null;
  ctx: InngestStepContext;
};

async function writeStepLog(payload: StepLogPayload): Promise<void> {
  try {
    const supabase = createServiceClient();
    const metadata = payload.ctx.metadata ?? {};
    await supabase.from("request_logs").insert({
      user_id: payload.ctx.user_id ?? null,
      application_id: payload.ctx.application_id ?? null,
      source: "inngest_step",
      name: payload.name,
      duration_ms: payload.duration_ms,
      status: payload.status,
      error_code: payload.errorCode,
      error_message: payload.errorMessage,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch {
    // Fire-and-forget by design.
  }
}

// Cron variant — same shape, but source='cron'.
export async function withCronLog<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now();
  let status: "ok" | "error" = "ok";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    return await fn();
  } catch (err) {
    status = "error";
    if (err instanceof ApiError) {
      errorCode = err.code;
      errorMessage = sanitiseErrorMessage(err.message);
    } else {
      errorCode = "internal_error";
      errorMessage = sanitiseErrorMessage(err);
      Sentry.captureException(err, { tags: { cron: name } });
    }
    throw err;
  } finally {
    const duration_ms = Date.now() - startedAt;
    try {
      const supabase = createServiceClient();
      await supabase.from("request_logs").insert({
        source: "cron",
        name,
        duration_ms,
        status,
        error_code: errorCode,
        error_message: errorMessage,
        metadata: metadata ?? null,
      });
    } catch {
      // Fire-and-forget.
    }
  }
}
