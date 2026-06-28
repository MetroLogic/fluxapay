/**
 * Stellar Explorer URL helpers.
 *
 * Reads NEXT_PUBLIC_STELLAR_NETWORK to determine which network
 * explorer to link to ("testnet" or "public").
 */

const STELLAR_EXPERT_BASE = "https://stellar.expert/explorer";

export type StellarNetwork = "testnet" | "public";

/**
 * Returns the currently configured Stellar network.
 * Defaults to "testnet" when unset or invalid.
 */
export function getStellarNetwork(): StellarNetwork {
  const raw = process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase();
  return raw === "public" ? "public" : "testnet";
}

/**
 * Whether Stellar Explorer links should open in a new tab.
 * Defaults to `true`.
 */
export function shouldOpenInNewTab(): boolean {
  const raw = process.env.NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB;
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() !== "false";
}

/**
 * Build a Stellar Expert transaction URL for the given hash.
 *
 * @param txHash - The transaction hash
 * @param network - Optional network override. If not provided, uses NEXT_PUBLIC_STELLAR_NETWORK
 *
 * @example
 * getStellarExpertTxUrl("abc123")
 * // → "https://stellar.expert/explorer/testnet/tx/abc123"
 * getStellarExpertTxUrl("abc123", "public")
 * // → "https://stellar.expert/explorer/public/tx/abc123"
 */
export function getStellarExpertTxUrl(txHash: string, network?: StellarNetwork): string {
  const resolvedNetwork = network || getStellarNetwork();
  return `${STELLAR_EXPERT_BASE}/${resolvedNetwork}/tx/${txHash}`;
}
