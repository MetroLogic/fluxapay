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

/**
 * Mapping of Stellar transaction error codes to user-friendly messages.
 * Keys are normalized to lowercase for case-insensitive lookup.
 */
export const STELLAR_ERROR_MESSAGES: Record<string, string> = {
  // Transaction result codes
  tx_insufficient_funds:
    "The sender account does not have enough funds to complete this transaction.",
  tx_insufficient_fee: "The sender account does not have enough funds to cover the network fee.",
  tx_insufficient_balance: "The sender account balance is too low for this transaction.",
  tx_bad_auth:
    "This transaction is not authorized. Please check the account signers and try again.",
  tx_bad_auth_extra:
    "This transaction is not authorized. Please check the account signers and try again.",
  tx_no_account: "The source account does not exist on the Stellar network.",
  tx_bad_seq: "The transaction sequence number is invalid. Please refresh and try again.",
  tx_too_early: "This transaction was submitted too early. Please try again.",
  tx_too_late: "This transaction has expired. Please rebuild and resubmit it.",
  tx_missing_operation: "The transaction does not contain any operations.",
  tx_failed: "The Stellar transaction failed. Please try again or contact support.",
  tx_too_many_operations: "The transaction contains too many operations.",
  tx_internal_error: "An internal error occurred while processing the Stellar transaction.",
  // Operation result codes
  op_underfunded: "The account has insufficient funds for this operation.",
  op_low_reserve: "The account does not meet the minimum reserve requirement.",
  op_no_destination: "The destination account does not exist.",
  op_no_destination_extra: "The destination account does not exist.",
  op_no_authorized: "This operation is not authorized.",
  op_no_line: "The destination account does not have a trustline for this asset.",
  op_no_issuer: "The asset issuer account does not exist.",
  op_cant_pay: "The source account cannot send this asset.",
  op_cross_self_payment: "The source and destination accounts are the same.",
  op_invalid_amount: "The transaction amount is invalid.",
  op_not_supported: "This operation is not supported.",
  // Common network / submission errors
  insufficient_funds: "The account has insufficient funds for this transaction.",
  bad_auth: "This transaction is not authorized.",
  not_found: "The requested Stellar resource was not found.",
  timeout: "The Stellar transaction timed out. Please try again.",
  connection_error: "Could not connect to the Stellar network. Please try again.",
};

/** Normalize a Stellar error code for lookup. */
export function normalizeStellarErrorCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s]+/g, "_");
}

/** Return a user-friendly message for a Stellar error code. */
export function getFriendlyStellarErrorMessage(code: string): string {
  const normalized = normalizeStellarErrorCode(code);
  return (
    STELLAR_ERROR_MESSAGES[normalized] ??
    STELLAR_ERROR_MESSAGES[normalized.replace(/^(tx|op)_/, "")] ??
    "The Stellar transaction failed. Please try again or contact support."
  );
}

/**
 * Build an API error payload for a failed Stellar transaction.
 * Includes both the friendly message and the raw Stellar error code for debugging.
 */
export function stellarTxError(
  code: string,
  extras?: Pick<ApiErrorPayload, "retryAfterSeconds" | "details" | "errors">,
): ApiErrorPayload {
  const normalized = normalizeStellarErrorCode(code);
  return apiError(
    402,
    ErrorCode.INTERNAL_ERROR,
    getFriendlyStellarErrorMessage(normalized),
    {
      ...extras,
      details: {
        ...(extras?.details ?? {}),
        stellar_error_code: normalized,
      },
    },
  );
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

  if ((status === 429 || status === 503) && retryAfterSeconds != null) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }

  return res.status(status).json({
    code,
    message,
    ...(details ? { details } : {}),
    ...(errors ? { errors } : {}),
    ...((status === 429 || status === 503) && retryAfterSeconds != null
      ? { retry_after_seconds: retryAfterSeconds }
      : {}),
  });
}
