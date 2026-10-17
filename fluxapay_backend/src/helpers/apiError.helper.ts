import { Response } from "express";
import { ErrorCode, ErrorCodeType } from "../types/errors";

export interface ApiErrorPayload {
  status: number;
  code: ErrorCodeType;
  message: string;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
  errors?: unknown[];
}

export function apiError(
  status: number,
  code: ErrorCodeType,
  message: string,
  extras: Partial<ApiErrorPayload> = {},
): ApiErrorPayload {
  return {
    status,
    code,
    message,
    ...extras,
  };
}

export function resolveApiError(err: unknown): ApiErrorPayload {
  if (err && typeof err === "object") {
    const e = err as Partial<ApiErrorPayload> & {
      status?: number;
      code?: string;
      message?: string;
      retryAfterSeconds?: number;
      details?: Record<string, unknown>;
      errors?: unknown[];
    };

    return {
      status: typeof e.status === "number" ? e.status : 500,
      code:
        typeof e.code === "string" && Object.values(ErrorCode).includes(e.code as ErrorCodeType)
          ? (e.code as ErrorCodeType)
          : ErrorCode.INTERNAL_ERROR,
      message: typeof e.message === "string" ? e.message : "Server error",
      ...(typeof e.retryAfterSeconds === "number" ? { retryAfterSeconds: e.retryAfterSeconds } : {}),
      ...(e.details ? { details: e.details } : {}),
      ...(e.errors ? { errors: e.errors } : {}),
    };
  }

  return {
    status: 500,
    code: ErrorCode.INTERNAL_ERROR,
    message: "Server error",
  };
}

export function sendApiError(res: Response, err: unknown): Response {
  const result = resolveApiError(err);

  if ((result.status === 429 || result.status === 503) && result.retryAfterSeconds != null) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
  }

  const payload: Record<string, unknown> = {
    code: result.code,
    message: result.message,
  };

  if (result.details) {
    payload.details = result.details;
  }

  if (result.errors) {
    payload.errors = result.errors;
  }

  if (result.retryAfterSeconds != null && (result.status === 429 || result.status === 503)) {
    payload.retry_after_seconds = result.retryAfterSeconds;
  }

  return res.status(result.status).json(payload);
}
