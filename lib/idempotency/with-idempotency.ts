// withIdempotency — body-hash protected idempotency cache for POST routes.
// 10-minute TTL via idempotency_keys.expires_at. Mismatched body for a
// reused key throws idempotency_key_conflict. On cache hit the stored
// response body is replayed verbatim and `replayed: true` is returned so
// the caller (and withLogging via ctx.replayed) can flag it.
//
// Signature is locked in CLAUDE.md Interface Contracts.

import "server-only";

import { createHash } from "node:crypto";

import { ApiError } from "@/lib/errors/api-error";
import { createServiceClient } from "@/lib/supabase/service";

type IdempotencyOptions = {
  user_id: string;
  route: string;
  body: unknown;
  /** From the Idempotency-Key header; null if absent. */
  idempotencyKey: string | null;
};

type Result<T> = { result: T; replayed: boolean };

export async function withIdempotency<T>(
  opts: IdempotencyOptions,
  handler: () => Promise<T>,
): Promise<Result<T>> {
  if (opts.idempotencyKey === null) {
    const result = await handler();
    return { result, replayed: false };
  }

  const supabase = createServiceClient();
  const request_hash = hashBody(opts.body);

  const { data: existing, error: readErr } = await supabase
    .from("idempotency_keys")
    .select("request_hash, response_status, response_body, expires_at")
    .eq("user_id", opts.user_id)
    .eq("key", opts.idempotencyKey)
    .eq("route", opts.route)
    .maybeSingle();

  if (readErr) throw new ApiError("database_error", readErr.message);

  if (existing) {
    const stillValid = new Date(existing.expires_at).getTime() > Date.now();
    if (stillValid) {
      if (existing.request_hash !== request_hash) {
        throw new ApiError("idempotency_key_conflict");
      }
      return { result: existing.response_body as T, replayed: true };
    }
    // Expired — fall through and overwrite below.
  }

  const result = await handler();

  const { error: writeErr } = await supabase.from("idempotency_keys").upsert(
    {
      user_id: opts.user_id,
      key: opts.idempotencyKey,
      route: opts.route,
      request_hash,
      response_status: 200,
      response_body: result as unknown as Record<string, unknown>,
      // expires_at default is now() + 10 minutes (set in DB).
    },
    { onConflict: "user_id,key,route" },
  );

  if (writeErr) {
    // Don't fail the user request because we couldn't cache the response.
    // The caller already got a real result; idempotency is best-effort.
  }

  return { result, replayed: false };
}

function hashBody(body: unknown): string {
  return createHash("sha256")
    .update(typeof body === "string" ? body : JSON.stringify(body ?? null))
    .digest("hex");
}
