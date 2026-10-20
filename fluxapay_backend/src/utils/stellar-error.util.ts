/**
 * Mapping of Stellar transaction / operation error codes to human-readable
 * messages, plus helpers to resolve a raw (on-chain) error code into a safe,
 * user-facing mapping (#1217).
 *
 * Keys are normalized to lowercase for case-insensitive lookup.
 */
export const STELLAR_ERROR_MESSAGES: Record<string, string> = {
  // Transaction result codes
  tx_insufficient_funds:
    "The sender account does not have enough funds to complete this transaction.",
  tx_insufficient_fee:
    "The sender account does not have enough funds to cover the network fee.",
  tx_insufficient_balance:
    "The sender account balance is too low for this transaction.",
  tx_bad_auth:
    "This transaction is not authorized. Please check the account signers and try again.",
  tx_bad_auth_extra:
    "This transaction is not authorized. Please check the account signers and try again.",
  tx_no_account: "The source account does not exist on the Stellar network.",
  tx_bad_seq:
    "The transaction sequence number is invalid. Please refresh and try again.",
  tx_too_early: "This transaction was submitted too early. Please try again.",
  tx_too_late: "This transaction has expired. Please rebuild and resubmit it.",
  tx_missing_operation: "The transaction does not contain any operations.",
  tx_failed: "The Stellar transaction failed. Please try again or contact support.",
  tx_too_many_operations: "The transaction contains too many operations.",
  tx_internal_error:
    "An internal error occurred while processing the Stellar transaction.",
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

/** Fallback message used when a Stellar error code is unknown or missing. */
export const DEFAULT_STELLAR_ERROR_MESSAGE =
  "The Stellar transaction could not be completed. Please try again or contact support.";

/** A resolved, user-friendly view of a raw Stellar error code. */
export interface StellarErrorMapping {
  code: string;
  friendlyMessage: string;
}

/**
 * Normalize a raw Stellar error code for lookup. Handles `null`/empty input and
 * trims/case-folds so callers can pass codes verbatim from the ledger.
 */
export function normalizeStellarErrorCode(
  code: string | null | undefined,
): string | null {
  if (typeof code !== "string") return null;
  const normalized = code.trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

/**
 * Resolve a raw Stellar error code into a `{ code, friendlyMessage }` mapping.
 * Never throws — unknown codes fall back to a generic message so the dashboard
 * can always render something useful.
 */
export function mapStellarError(
  code: string | null | undefined,
): StellarErrorMapping {
  const normalized = normalizeStellarErrorCode(code);
  const resolvedCode = normalized ?? "unknown";
  return {
    code: resolvedCode,
    friendlyMessage: normalized
      ? STELLAR_ERROR_MESSAGES[normalized] ?? DEFAULT_STELLAR_ERROR_MESSAGE
      : DEFAULT_STELLAR_ERROR_MESSAGE,
  };
}
