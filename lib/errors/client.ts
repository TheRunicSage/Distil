// Frontend error mapping. Both helpers accept the body shape produced by
// the withLogging wrapper: `{ error: { code, message } }`. Components can
// branch on `body.error.code` for richer per-code UX where useful.

import { ERROR_CODES, type ErrorCode } from "./codes";

type ErrorBody = {
  error?: { code?: string; message?: string };
};

function isKnownCode(code: string | undefined): code is ErrorCode {
  return code !== undefined && code in ERROR_CODES;
}

export function getUserMessage(body: ErrorBody | unknown): string {
  const code = (body as ErrorBody)?.error?.code;
  if (isKnownCode(code)) return ERROR_CODES[code].user_message;
  const message = (body as ErrorBody)?.error?.message;
  if (typeof message === "string" && message.length > 0) return message;
  return ERROR_CODES.internal_error.user_message;
}

export function isRetryable(body: ErrorBody | unknown): boolean {
  const code = (body as ErrorBody)?.error?.code;
  if (isKnownCode(code)) return ERROR_CODES[code].client_retryable;
  return true;
}
