/**
 * cron.service.ts
 *
 * Sets up scheduled jobs for FluxaPay.
 *
 * Jobs:
 *  • Settlement batch – runs daily at 00:00 UTC
 *
 * Environment variables:
 *  SETTLEMENT_CRON   – Override cron expression (default: "0 0 * * *")
 *  DISABLE_CRON      – Set to "true" to disable all jobs (e.g. in test environments)
 */

import { schedule, validate, type ScheduledTask } from "node-cron";
import { runSettlementBatch } from "./settlementBatch.service";

/** Cron expression for the settlement job (default 00:00 UTC every day). */
const SETTLEMENT_CRON_EXPR = process.env.SETTLEMENT_CRON ?? "0 0 * * *";

let settlementTask: ScheduledTask | null = null;

/**
 * Starts all scheduled cron jobs.
 * Call this once from the application entry-point (index.ts).
 */
export function startCronJobs(): void {
    if (process.env.DISABLE_CRON === "true") {
        console.log("[Cron] DISABLE_CRON=true – all scheduled jobs are disabled.");
        return;
    }

    // ── Daily Settlement Batch ─────────────────────────────────────────────────
    if (!validate(SETTLEMENT_CRON_EXPR)) {
        console.error(
            `[Cron] Invalid SETTLEMENT_CRON expression: "${SETTLEMENT_CRON_EXPR}". ` +
            `Using default "0 0 * * *" instead.`,
        );
    }

    settlementTask = schedule(
        SETTLEMENT_CRON_EXPR,
        async () => {
            console.log(`[Cron] ⏰ Settlement batch triggered at ${new Date().toISOString()}`);
            try {
                const result = await runSettlementBatch();
                console.log(
                    `[Cron] ✅ Settlement batch ${result.batchId} finished – ` +
                    `${result.totalMerchantsSucceeded}/${result.totalMerchantsProcessed} merchants settled.`,
                );
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[Cron] ❌ Settlement batch failed with unhandled error: ${msg}`);
            }
        },
        {
            timezone: "UTC",
        },
    );

    console.log(
        `[Cron] ✅ Settlement batch job scheduled (${SETTLEMENT_CRON_EXPR}) in UTC timezone.`,
    );
}

/**
 * Stops all running cron jobs gracefully.
 * Useful during graceful shutdown or in tests.
 */
export function stopCronJobs(): void {
    if (settlementTask) {
        settlementTask.stop();
        settlementTask = null;
        console.log("[Cron] Settlement batch job stopped.");
    }
}
