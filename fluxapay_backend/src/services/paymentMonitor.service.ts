/**
 * paymentMonitor.service.ts
 *
 * @deprecated This service has been superseded by `paymentOracle.service.ts`, which is the
 * sole authority for on-chain Stellar payment detection.  All Horizon polling, Prisma updates,
 * event emissions, and Soroban verification previously performed here now happen exclusively
 * inside `runOracleTick()` (paymentOracle.service.ts).
 *
 * Payment expiry (pending → expired transitions) is handled by:
 *   - `paymentExpiry.service.ts`  — runs every 5 min via cron with a distributed CronLock
 *   - `runOracleTick()` step 1   — marks expired rows on every Oracle tick
 *
 * The `startPaymentMonitor` / `stopPaymentMonitor` stubs are retained only to avoid breaking
 * existing imports in `index.ts`, `shutdown.service.ts`, and `paymentMonitor.worker.ts`.
 * They are intentionally no-ops and will be removed in a subsequent cleanup PR.
 */

import { getLogger } from "../utils/logger";

const logger = getLogger();

/**
 * @deprecated No-op stub. All on-chain detection has moved to paymentOracle.service.ts.
 * This function does nothing and will be removed in a future cleanup PR.
 */
export async function runPaymentMonitorTick(): Promise<void> {
  // Intentional no-op. See file-level deprecation notice.
}

/**
 * @deprecated No-op stub. Call startPaymentOracle() from paymentOracle.service.ts instead.
 */
export function startPaymentMonitor(): void {
  logger.warn(
    "[PaymentMonitor] startPaymentMonitor() is deprecated and is now a no-op. " +
    "All Horizon polling is handled by paymentOracle.service.ts (startPaymentOracle)."
  );
}

/**
 * @deprecated No-op stub. Call stopPaymentOracle() from paymentOracle.service.ts instead.
 */
export function stopPaymentMonitor(): void {
  // Intentional no-op. See file-level deprecation notice.
}
