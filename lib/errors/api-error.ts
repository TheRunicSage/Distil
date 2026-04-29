// ApiError — the only error type API routes throw. The withLogging wrapper
// catches it and produces the JSON envelope and HTTP status from the entry
// in ERROR_CODES. Other errors are wrapped as `internal_error` 500.
// Signature is locked in CLAUDE.md Interface Contracts.

import { ERROR_CODES, type ErrorCode } from "./codes";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, overrideMessage?: string) {
    const entry = ERROR_CODES[code];
    super(overrideMessage ?? entry.user_message);
    this.code = code;
    this.httpStatus = entry.http_status;
    this.name = "ApiError";
  }
}
