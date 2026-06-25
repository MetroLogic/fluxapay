/**
 * Utility helper functions for settlement report reconciliation.
 */

/**
 * Calculates the absolute discrepancy between the expected USDC amount
 * and the actual net amount plus fees.
 * 
 * @param expectedAmount Expected USDC amount
 * @param netAmount Actual received net amount
 * @param fees Payout fees charged
 * @returns The absolute discrepancy amount
 */
export function calculateDiscrepancy(
  expectedAmount: number,
  netAmount: number,
  fees: number
): number {
  return Math.abs(expectedAmount - (netAmount + fees));
}
