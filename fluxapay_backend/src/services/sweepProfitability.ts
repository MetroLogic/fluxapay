/**
 * Pure sweep profitability logic (no I/O) used by SweepService.shouldSweepAddress().
 */
export const BELOW_PROFITABILITY_THRESHOLD = "BELOW_PROFITABILITY_THRESHOLD";

export interface ProfitabilityInput {
  /** Deposit balance in USDC. */
  depositBalance: number;
  /** Estimated network fee + reserve overhead, denominated in USDC. */
  estimatedFee: number;
  /** Minimum net amount (balance - fee) worth sweeping, in USDC. */
  minProfitability: number;
  /** Age of the deposit in ms (since payment creation / last sweep attempt). */
  ageMs?: number;
  /** After this age the balance is swept regardless of profitability. */
  windowMs?: number;
}

export interface ProfitabilityDecision {
  sweep: boolean;
  reason?: typeof BELOW_PROFITABILITY_THRESHOLD;
  net: number;
}

export function evaluateSweepProfitability(i: ProfitabilityInput): ProfitabilityDecision {
  const net = i.depositBalance - i.estimatedFee;
  if (net >= i.minProfitability) return { sweep: true, net };
  if (i.windowMs !== undefined && i.ageMs !== undefined && i.ageMs >= i.windowMs && net > 0) {
    // Sweep window expired: sweep anything that still nets positive.
    return { sweep: true, net };
  }
  return { sweep: false, reason: BELOW_PROFITABILITY_THRESHOLD, net };
}

export function getEstimatedSweepFeeUsdc(): number {
  const v = Number(process.env.SWEEP_ESTIMATED_FEE_USDC);
  return Number.isFinite(v) && v >= 0 && process.env.SWEEP_ESTIMATED_FEE_USDC ? v : 0.01;
}

export function getSweepDeferWindowMs(): number {
  const h = Number(process.env.SWEEP_DEFER_WINDOW_HOURS);
  return (Number.isFinite(h) && h > 0 ? h : 72) * 3600 * 1000;
}
