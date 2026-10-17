import type { Payment } from "./types";

/**
 * Human-readable fallback shown when a payment/transaction failed but the
 * backend did not record a specific reason. It is deliberately actionable
 * (what to check, what to do next) instead of the old generic
 * "Transaction was rejected or faulted".
 */
export const PAYMENT_FAILURE_FALLBACK =
  "The Stellar transaction was rejected by the network. Confirm the customer sent the exact amount from a funded account, then retry. If it keeps failing, open the transaction in the explorer and share the hash with support.";

/**
 * Builds a descriptive failure message for a failed payment.
 *
 * The most recent `failed` status-history entry that carries a note wins, so a
 * precise backend reason (e.g. "insufficient balance", "invalid memo") is
 * surfaced to the user. When no reason was recorded, an actionable fallback is
 * returned rather than a generic one-liner.
 */
export function describePaymentFailure(
  payment: Pick<Payment, "statusHistory">
): string {
  const history = payment.statusHistory ?? [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.status === "failed" && entry.note && entry.note.trim().length > 0) {
      return entry.note.trim();
    }
  }

  return PAYMENT_FAILURE_FALLBACK;
}
