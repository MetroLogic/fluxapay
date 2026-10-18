import { Response } from "express";
import { ErrorCode, ErrorCodeType } from "../types/errors";

export interface ApiErrorPayload {
  status: number;
  code: ErrorCodeType;
  message: string;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
  errors?: unknown[];
  [key: string]: unknown;
}

export function apiError(
  status: number,
  code: ErrorCodeType | string = ErrorCode.INTERNAL_ERROR,
  message: string,
  extras: Record<string, unknown> = {},
): ApiErrorPayload {
  const resolvedCode = Object.values(ErrorCode).includes(code as ErrorCodeType)
    ? (code as ErrorCodeType)
    : ErrorCode.INTERNAL_ERROR;

  const payload: ApiErrorPayload = {
    status,
    code: resolvedCode,
    message,
    ...extras,
  };

  if (typeof (extras as { retryAfterSeconds?: number }).retryAfterSeconds === "number") {
    payload.retryAfterSeconds = (extras as { retryAfterSeconds?: number }).retryAfterSeconds;
  }

  return payload;
}

export function sendApiError(
  res: Response,
  payload: Partial<ApiErrorPayload> | { status?: number; code?: string; message?: string },
): Response {
  const status = typeof payload?.status === "number" ? payload.status : 500;
  const code = payload?.code ?? ErrorCode.INTERNAL_ERROR;
  const message = payload?.message ?? "Internal server error";
  const retryAfterSeconds =
    (payload as Partial<ApiErrorPayload>)?.retryAfterSeconds ??
    (payload as Partial<ApiErrorPayload>)?.retry_after_seconds;

  const response: Record<string, unknown> = {
    code,
    message,
  };

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (key === "status" || key === "code" || key === "message" || key === "retryAfterSeconds" || key === "retry_after_seconds") {
      continue;
    }
    if (value !== undefined) {
      response[key] = value;
    }
  }

  if (typeof retryAfterSeconds === "number") {
    response.retry_after_seconds = retryAfterSeconds;
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }

  res.status(status).json(response);
  return res;
}
