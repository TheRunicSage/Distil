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
import { ZodError } from "zod";

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
    let errorMetadata: Record<string, unknown> | null = null;

    try {
      const result = await fn();
      return result;
    } catch (err) {
      status = "error";
      const apiError = findApiError(err);
      if (apiError) {
        errorCode = apiError.code;
        errorMessage = sanitiseErrorMessage(apiError.message);
      } else {
        errorCode = "internal_error";
        errorMessage = sanitiseErrorMessage(err);
        Sentry.captureException(err, { tags: { inngest_step: name } });
      }
      const zod = findZodError(err);
      if (zod) {
        errorMetadata = { zod_issues: summariseZodIssues(zod) };
      }
      const provider = findProviderError(err);
      if (provider) {
        errorMetadata = {
          ...(errorMetadata ?? {}),
          provider_error: provider,
        };
      }
      const jsonParse = findJsonParseExcerpt(err);
      if (jsonParse) {
        errorMetadata = {
          ...(errorMetadata ?? {}),
          json_parse_excerpt: jsonParse.excerpt,
          json_parse_message: jsonParse.message,
          json_repair_attempted: jsonParse.repairAttempted,
          json_repair_error: jsonParse.repairError ?? null,
        };
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
        errorMetadata,
      });
    }
  });
}

// Walk the cause chain to find a richer error type. Inngest's
// NonRetriableError wraps the real cause (e.g. an ApiError or ZodError)
// so we have to look past the outer wrapper to log the right code and
// metadata.
function findApiError(err: unknown): ApiError | null {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur instanceof ApiError) return cur;
    cur = (cur as { cause?: unknown })?.cause;
  }
  return null;
}

function findZodError(err: unknown): ZodError | null {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur instanceof ZodError) return cur;
    cur = (cur as { cause?: unknown })?.cause;
  }
  return null;
}

// Walk the cause chain for an OpenAI-SDK-shaped APIError. We don't
// import the openai package here (it shouldn't leak into a generic
// logging helper); we just look for the duck-typed shape: an Error
// with a numeric `status` and a string `message`, that isn't already
// classified as ApiError or ZodError. This catches the wrapped 400s
// from the DeepSeek provider so the actual provider wording lands
// in request_logs.metadata.provider_error instead of being lost
// behind the generic ApiError user_message.
function findProviderError(
  err: unknown,
): { status: number; message: string } | null {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    if (
      cur instanceof Error &&
      !(cur instanceof ApiError) &&
      !(cur instanceof ZodError)
    ) {
      const status = (cur as { status?: unknown }).status;
      if (typeof status === "number") {
        return {
          status,
          message: sanitiseErrorMessage(cur.message),
        };
      }
    }
    cur = (cur as { cause?: unknown })?.cause;
  }
  return null;
}

// Walk the cause chain for the JSON-parse-failure shape attached by
// the DeepSeek provider when both raw parse and jsonrepair fail. Duck-
// typed so we don't have to export a class from the provider package
// just to share with the logger.
function findJsonParseExcerpt(err: unknown): {
  excerpt: string;
  message: string;
  repairAttempted: boolean;
  repairError: string | null;
} | null {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    const candidate = cur as {
      json_parse_excerpt?: unknown;
      message?: unknown;
      json_repair_attempted?: unknown;
      json_repair_error?: unknown;
    };
    if (typeof candidate.json_parse_excerpt === "string") {
      return {
        excerpt: candidate.json_parse_excerpt,
        message:
          typeof candidate.message === "string"
            ? sanitiseErrorMessage(candidate.message)
            : "JSON.parse failed",
        repairAttempted: Boolean(candidate.json_repair_attempted),
        repairError:
          typeof candidate.json_repair_error === "string"
            ? sanitiseErrorMessage(candidate.json_repair_error)
            : null,
      };
    }
    cur = (cur as { cause?: unknown })?.cause;
  }
  return null;
}

function summariseZodIssues(
  err: ZodError,
): Array<{ path: string; code: string; message: string }> {
  // Cap to 20 issues so a fully-malformed payload doesn't blow up the
  // metadata column. Path joined with "." so it grep-greps cleanly.
  return err.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map((p) => String(p)).join(".") || "(root)",
    code: issue.code,
    message: sanitiseErrorMessage(issue.message),
  }));
}

type StepLogPayload = {
  name: string;
  duration_ms: number;
  status: "ok" | "error";
  errorCode: string | null;
  errorMessage: string | null;
  ctx: InngestStepContext;
  errorMetadata?: Record<string, unknown> | null;
};

async function writeStepLog(payload: StepLogPayload): Promise<void> {
  try {
    const supabase = createServiceClient();
    const ctxMetadata = payload.ctx.metadata ?? {};
    const errorMetadata = payload.errorMetadata ?? {};
    const metadata = { ...ctxMetadata, ...errorMetadata };
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
