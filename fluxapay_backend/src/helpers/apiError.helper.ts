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

/** Build a throwable API error object for use in services/controllers. */
export function apiError(
  status: number,
  code: ErrorCodeType,
  message: string,
  extras?: Pick<ApiErrorPayload, "retryAfterSeconds" | "details" | "errors">,
): ApiErrorPayload {
  return { status, code, message, ...extras };
}

/** Normalize any thrown value into a structured API error payload. */
export function resolveApiError(err: unknown): ApiErrorPayload {
  if (err && typeof err === "object") {
    const e = err as Partial<ApiErrorPayload> & {
      message?: string;
      status?: number;
      code?: ErrorCodeType;
    };
    const status = e.status ?? 500;
    const message = e.message ?? "Server error";
    const code = e.code ?? ErrorCode.INTERNAL_ERROR;
    return {
      status,
      code,
      message,
      ...(e.retryAfterSeconds != null
        ? { retryAfterSeconds: e.retryAfterSeconds }
        : {}),
      ...(e.details ? { details: e.details } : {}),
      ...(e.errors ? { errors: e.errors } : {}),
    };
  }
  return apiError(500, ErrorCode.INTERNAL_ERROR, "Server error");
}

/** Send a standardized JSON error response with required `code` field. */
export function sendApiError(res: Response, err: unknown): Response {
  const { status, code, message, retryAfterSeconds, details, errors } =
    resolveApiError(err);

  if (status === 429 && retryAfterSeconds != null) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }

  return res.status(status).json({
    code,
    message,
    ...(details ? { details } : {}),
    ...(errors ? { errors } : {}),
    ...(status === 429 && retryAfterSeconds != null
      ? { retry_after_seconds: retryAfterSeconds }
      : {}),
  });
}
