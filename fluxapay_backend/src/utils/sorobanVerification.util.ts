/**
 * Soroban on-chain verification configuration.
 *
 * Fallback when Soroban call fails (fail-closed):
 * - When verification is enabled, a failed Soroban RPC/contract call causes the
 *   payment to be marked as `failed` rather than confirmed (see paymentOracle.service).
 * - Horizon balance/payment detection alone is not sufficient when verification is on.
 *
 * To explicitly disable verification (e.g. local dev), set ENABLE_SOROBAN_VERIFICATION=false.
 */

export function isSorobanVerificationEnabled(): boolean {
  const explicit = process.env.ENABLE_SOROBAN_VERIFICATION;
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function getSorobanVerificationDefault(): "true" | "false" {
  return process.env.NODE_ENV === "production" ? "true" : "false";
}
