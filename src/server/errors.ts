import type { DataErrorCode } from "@/data/types";

export type ApiErrorCode = DataErrorCode | "BAD_REQUEST";

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  REV_CONFLICT: 409,
  LIMIT_REACHED: 403,
  INVALID: 400,
  BAD_REQUEST: 400,
  UNSUPPORTED_FILE: 415,
  FILE_TOO_LARGE: 413,
  DECODE_FAILED: 400,
  RATE_LIMITED: 429,
  UPLOAD_MISSING: 409,
  IN_USE: 409,
  ACCOUNT_DELETING: 403,
  NETWORK: 502,
  INTERNAL: 500,
};

/** An error that is safe to show to the caller. Anything else becomes a plain 500. */
export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  retryAfter?: number;
  constructor(code: ApiErrorCode, message: string, opts?: { retryAfter?: number }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.retryAfter = opts?.retryAfter;
  }
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
