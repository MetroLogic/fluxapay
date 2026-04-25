/**
 * cron.service.ts
 *
 * Sets up scheduled jobs for FluxaPay.
 *
 * Jobs:
 *  • Settlement batch     – runs daily at 00:00 UTC (swept → fiat payout)
 *  • Payment monitor      – runs every 2 min (on-chain USDC detection)
 *  • Billing cycle        – runs daily at 01:00 UTC (subscription renewals)
 *  • Database backup      – runs daily at 02:00 UTC (encrypted SQL dump)
 *
 * Environment variables:
 *  SETTLEMENT_CRON        – Cron for settlement (default: "0 0 * * *")
 *  PAYMENT_MONITOR_CRON   – Cron for on-chain payment checks (default: "*/2 * * * *")
 *  BILLING_CRON           – Cron for subscription billing (default: "0 1 * * *")
 *  DB_BACKUP_CRON         – Cron for database backup (default: "0 2 * * *")
 *  DISABLE_CRON           – Set to "true" to disable all jobs (e.g. in test environments)
 */

import { schedule, validate, type ScheduledTask } from "node-cron";
import { runSettlementBatch } from "./settlementBatch.service";
import { processBillingCycle } from "./plan.service";
import { runSweepWithLock } from "./sweepCron.service";
import { funderMonitorService } from "./funderMonitor.service";
import { runPaymentExpiryReminderJob } from "./paymentExpiryReminder.service";
import { runPaymentExpiryJob } from "./paymentExpiry.service";
import { performDatabaseBackup } from "./dbBackup.service";
import { cleanupExpiredIdempotencyRecords } from "../middleware/idempotency.middleware";

const SETTLEMENT_CRON_EXPR = process.env.SETTLEMENT_CRON ?? "0 0 * * *";
const BILLING_CRON_EXPR = process.env.BILLING_CRON ?? "0 1 * * *";
const SWEEP_CRON_EXPR = process.env.SWEEP_CRON ?? "*/5 * * * *";
const FUNDER_MONITOR_CRON_EXPR = process.env.FUNDER_MONITOR_CRON ?? "*/10 * * * *";
const CHECKOUT_REMINDER_CRON_EXPR = process.env.CHECKOUT_REMINDER_CRON ?? "*/2 * * * *";
const PAYMENT_EXPIRY_CRON_EXPR = process.env.PAYMENT_EXPIRY_CRON ?? "*/5 * * * *";
const DB_BACKUP_CRON_EXPR = process.env.DB_BACKUP_CRON ?? "0 2 * * *";
const IDEMPOTENCY_CLEANUP_CRON_EXPR = process.env.IDEMPOTENCY_CLEANUP_CRON ?? "0 3 * * *";

let settlementTask: ScheduledTask | null = null;
let billingTask: ScheduledTask | null = null;
let sweepTask: ScheduledTask | null = null;
let funderMonitorTask: ScheduledTask | null = null;
let checkoutReminderTask: ScheduledTask | null = null;
let paymentExpiryTask: ScheduledTask | null = null;
let dbBackupTask: ScheduledTask | null = null;
let idempotencyCleanupTask: ScheduledTask | null = null;

/**
 * Starts all scheduled cron jobs.
 */
export function startCronJobs(): void {
  if (process.env.DISABLE_CRON === "true") {
    console.log("[Cron] DISABLE_CRON=true – all scheduled jobs are disabled.");
    return;
  }

  // ── Daily Settlement Batch ─────────────────────────────────────────────────
  settlementTask = schedule(SETTLEMENT_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Settlement batch triggered at ${new Date().toISOString()}`);
    try {
      const result = await runSettlementBatch();
      console.log(`[Cron] ✅ Settlement batch ${result.batchId} finished – ${result.totalMerchantsSucceeded}/${result.totalMerchantsProcessed} merchants settled.`);
    } catch (err: any) {
      console.error(`[Cron] ❌ Settlement batch failed: ${err.message}`);
    }
  }, { timezone: "UTC" });

  // ── Billing cycle ────────────────────────────────────
  billingTask = schedule(BILLING_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Billing cycle triggered at ${new Date().toISOString()}`);
    try {
      const result = await processBillingCycle();
      console.log(`[Cron] ✅ Billing cycle finished – ${result.renewed}/${result.processed} renewed.`);
    } catch (err: any) {
      console.error(`[Cron] ❌ Billing cycle failed: ${err.message}`);
    }
  }, { timezone: "UTC" });

  // ── Sweep Job ─────────────────────────
  sweepTask = schedule(SWEEP_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Sweep triggered at ${new Date().toISOString()}`);
    await runSweepWithLock();
  }, { timezone: "UTC" });

  // ── Funder Monitor ───────────────────
  funderMonitorTask = schedule(FUNDER_MONITOR_CRON_EXPR, async () => {
    try {
      const status = await funderMonitorService.getBalanceStatus();
      if (!status.ok) {
        console.warn(`[Cron] ⚠️ FUNDER low balance: ${status.xlmBalance} XLM. pub=${status.publicKey}`);
      }
    } catch (err: any) {
      console.error(`[Cron] ❌ Funder monitor failed: ${err.message}`);
    }
  }, { timezone: "UTC" });

  // ── Checkout Expiry Reminder ────────────────────────────────────────
  checkoutReminderTask = schedule(CHECKOUT_REMINDER_CRON_EXPR, async () => {
    try {
      const result = await runPaymentExpiryReminderJob();
      if (result.processed > 0) {
        console.log(`[Cron] ✅ Checkout reminder — ${result.notified}/${result.processed} notified.`);
      }
    } catch (err: any) {
      console.error(`[Cron] ❌ Checkout reminder job failed: ${err.message}`);
    }
  }, { timezone: "UTC" });

  // ── Payment Expiry Job (pending → expired) ────────────────────────────────
  if (process.env.DISABLE_PAYMENT_EXPIRY_CRON !== "true") {
    if (validate(PAYMENT_EXPIRY_CRON_EXPR)) {
      paymentExpiryTask = schedule(
        PAYMENT_EXPIRY_CRON_EXPR,
        async () => {
          console.log(`[Cron] ⏰ Payment expiry job triggered at ${new Date().toISOString()}`);
          try {
            const result = await runPaymentExpiryJob();
            if (result.processed > 0) {
              console.log(
                `[Cron] ✅ Payment expiry — ${result.expired}/${result.processed} expired, ` +
                `${result.webhookErrors.length} webhook error(s).`,
              );
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Cron] ❌ Payment expiry job failed: ${msg}`);
          }
        },
        { timezone: "UTC" },
      );
      console.log(`[Cron] ✅ Payment expiry job scheduled (${PAYMENT_EXPIRY_CRON_EXPR}) in UTC.`);
    } else {
      console.warn(`[Cron] Invalid PAYMENT_EXPIRY_CRON "${PAYMENT_EXPIRY_CRON_EXPR}" – payment expiry disabled.`);
    }
  } else {
    console.log("[Cron] DISABLE_PAYMENT_EXPIRY_CRON=true – payment expiry job disabled.");
  }

  // ── Idempotency Cleanup Job ────────────────────────────────────────
  idempotencyCleanupTask = schedule(IDEMPOTENCY_CLEANUP_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Idempotency cleanup triggered at ${new Date().toISOString()}`);
    try {
      const deletedCount = await cleanupExpiredIdempotencyRecords();
      console.log(`[Cron] ✅ Idempotency cleanup — ${deletedCount} expired records deleted.`);
    } catch (err: any) {
      console.error(`[Cron] ❌ Idempotency cleanup failed: ${err.message}`);
    }
  }, { timezone: "UTC" });
  console.log(`[Cron] ✅ Idempotency cleanup job scheduled (${IDEMPOTENCY_CLEANUP_CRON_EXPR}) in UTC.`);
}

/**
 * Stops all running cron jobs gracefully.
 */
export function stopCronJobs(): void {
  const tasks: [ScheduledTask | null, string][] = [
    [settlementTask, "Settlement batch"],
    [billingTask, "Billing cycle"],
    [sweepTask, "Sweep"],
    [funderMonitorTask, "Funder monitor"],
    [checkoutReminderTask, "Checkout reminder"],
    [paymentExpiryTask, "Payment expiry"],
    [dbBackupTask, "Database backup"],
    [idempotencyCleanupTask, "Idempotency cleanup"],
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
  checkoutReminderTask = null;
  paymentExpiryTask = null;
  dbBackupTask = null;
  idempotencyCleanupTask = null;
}
