/**
 * cron.service.ts
 *
 * Sets up scheduled jobs for FluxaPay.
 *
 * Jobs:
 *  • Settlement batch     – runs daily at 00:00 UTC (swept → fiat payout)
 *  • Payment monitor      – runs every 2 min (on-chain USDC detection)
 *  • Billing cycle        – runs daily at 01:00 UTC (subscription renewals)
 *
 * Environment variables:
 *  SETTLEMENT_CRON        – Cron for settlement (default: "0 0 * * *")
 *  PAYMENT_MONITOR_CRON  – Cron for on-chain payment checks (default: "* / 2 * * * *")
 *  BILLING_CRON          – Cron for subscription billing (default: "0 1 * * *")
 *  DISABLE_CRON          – Set to "true" to disable all jobs (e.g. in test environments)
 */

import { schedule, validate, type ScheduledTask } from "node-cron";
import { runSettlementBatch } from "./settlementBatch.service";
import { processBillingCycle } from "./plan.service";
import { sweepService } from "./sweep.service";
import { funderMonitorService } from "./funderMonitor.service";

const SETTLEMENT_CRON_EXPR = process.env.SETTLEMENT_CRON ?? "0 0 * * *";
const BILLING_CRON_EXPR = process.env.BILLING_CRON ?? "0 1 * * *";
const SWEEP_CRON_EXPR = process.env.SWEEP_CRON ?? "55 23 * * *"; // 23:55 UTC daily (5 min before settlement)
const FUNDER_MONITOR_CRON_EXPR = process.env.FUNDER_MONITOR_CRON ?? "*/10 * * * *"; // every 10 minutes

let settlementTask: ScheduledTask | null = null;
let billingTask: ScheduledTask | null = null;
let sweepTask: ScheduledTask | null = null;
let funderMonitorTask: ScheduledTask | null = null;

/**
 * Starts all scheduled cron jobs.
 * Call this once from the application entry-point (index.ts).
 */
export function startCronJobs(): void {
  if (process.env.DISABLE_CRON === "true") {
    console.log(
      "[Cron] DISABLE_CRON=true – all scheduled jobs are disabled.",
    );
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
      console.log(
        `[Cron] ⏰ Settlement batch triggered at ${new Date().toISOString()}`,
      );
      try {
        const result = await runSettlementBatch();
        console.log(
          `[Cron] ✅ Settlement batch ${result.batchId} finished – ` +
          `${result.totalMerchantsSucceeded}/${result.totalMerchantsProcessed} merchants settled.`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[Cron] ❌ Settlement batch failed with unhandled error: ${msg}`,
        );
      }
    },
    { timezone: "UTC" },
  );
  console.log(
    `[Cron] ✅ Settlement batch job scheduled (${SETTLEMENT_CRON_EXPR}) in UTC.`,
  );

  // Note: On-chain payment monitor was moved to its own loop in paymentMonitor.service.ts


  // ── Billing cycle (subscription renewals) ────────────────────────────────────
  if (validate(BILLING_CRON_EXPR)) {
    billingTask = schedule(
      BILLING_CRON_EXPR,
      async () => {
        console.log(
          `[Cron] ⏰ Billing cycle triggered at ${new Date().toISOString()}`,
        );
        try {
          const result = await processBillingCycle();
          console.log(
            `[Cron] ✅ Billing cycle finished – ${result.renewed}/${result.processed} renewed.`,
          );
          if (result.errors.length > 0) {
            result.errors.forEach((e) => console.error("[Cron] Billing:", e));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[Cron] ❌ Billing cycle failed: ${msg}`,
          );
        }
      },
      { timezone: "UTC" },
    );
    console.log(
      `[Cron] ✅ Billing cycle job scheduled (${BILLING_CRON_EXPR}) in UTC.`,
    );
  } else {
    console.warn(
      `[Cron] Invalid BILLING_CRON "${BILLING_CRON_EXPR}" – billing cycle disabled.`,
    );
  }

  // ── Daily Sweep Job (move USDC → master vault) ─────────────────────────────
  if (process.env.DISABLE_SWEEP_CRON !== "true") {
    if (validate(SWEEP_CRON_EXPR)) {
      sweepTask = schedule(
        SWEEP_CRON_EXPR,
        async () => {
          console.log(`[Cron] ⏰ Sweep triggered at ${new Date().toISOString()}`);
          try {
            const res = await sweepService.sweepPaidPayments({ adminId: "system" });
            console.log(
              `[Cron] ✅ Sweep finished: ${res.addressesSwept} address(es), total=${res.totalAmount} USDC.`,
            );
            if (res.skipped.length > 0) {
              console.warn(`[Cron] Sweep skipped ${res.skipped.length} payment(s).`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Cron] ❌ Sweep failed: ${msg}`);
          }
        },
        { timezone: "UTC" },
      );
      console.log(`[Cron] ✅ Sweep job scheduled (${SWEEP_CRON_EXPR}) in UTC.`);
    } else {
      console.warn(`[Cron] Invalid SWEEP_CRON "${SWEEP_CRON_EXPR}" – sweep disabled.`);
    }
  } else {
    console.log("[Cron] DISABLE_SWEEP_CRON=true – sweep job disabled.");
  }

  // ── Funder Balance Monitor (XLM reserve funding wallet) ───────────────────
  if (process.env.DISABLE_FUNDER_MONITOR_CRON !== "true") {
    if (validate(FUNDER_MONITOR_CRON_EXPR)) {
      funderMonitorTask = schedule(
        FUNDER_MONITOR_CRON_EXPR,
        async () => {
          try {
            const status = await funderMonitorService.getBalanceStatus();
            if (!status.ok) {
              console.warn(
                `[Cron] ⚠️ FUNDER wallet low balance: ${status.xlmBalance} XLM (threshold=${status.thresholdXlm}). pub=${status.publicKey}`,
              );
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Cron] ❌ Funder monitor failed: ${msg}`);
          }
        },
        { timezone: "UTC" },
      );
      console.log(`[Cron] ✅ Funder monitor job scheduled (${FUNDER_MONITOR_CRON_EXPR}) in UTC.`);
    } else {
      console.warn(`[Cron] Invalid FUNDER_MONITOR_CRON "${FUNDER_MONITOR_CRON_EXPR}" – funder monitor disabled.`);
    }
  } else {
    console.log("[Cron] DISABLE_FUNDER_MONITOR_CRON=true – funder monitor job disabled.");
  }
}

/**
 * Stops all running cron jobs gracefully.
 * Useful during graceful shutdown or in tests.
 */
export function stopCronJobs(): void {
  const tasks: [ScheduledTask | null, string][] = [
    [settlementTask, "Settlement batch"],
    [billingTask, "Billing cycle"],
    [sweepTask, "Sweep"],
    [funderMonitorTask, "Funder monitor"],
  ];
  for (const [task, name] of tasks) {
    if (task) {
      task.stop();
      console.log(`[Cron] ${name} job stopped.`);
    }
  }
  settlementTask = null;
  billingTask = null;
  sweepTask = null;
  funderMonitorTask = null;
}
