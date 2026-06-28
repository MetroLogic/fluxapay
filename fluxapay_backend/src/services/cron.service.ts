/**
 * cron.service.ts
 *
 * Sets up scheduled jobs for FluxaPay.
 *
 * Jobs:
 *  • Settlement batch        – runs daily at 00:00 UTC (swept → fiat payout)
 *  • Payment monitor         – runs every 2 min (on-chain USDC detection)
 *  • Billing cycle           – runs daily at 01:00 UTC (subscription renewals)
 *  • Database backup         – runs daily at 02:00 UTC (encrypted SQL dump)
 *  • Invoice overdue check   – runs every hour
 *  • Idempotency cleanup     – runs daily at 03:00 UTC
 *
 * Environment variables:
 *  SETTLEMENT_CRON           – Cron for settlement (default: "0 0 * * *")
 *  BILLING_CRON              – Cron for subscription billing (default: "0 1 * * *")
 *  DB_BACKUP_CRON            – Cron for database backup (default: "0 2 * * *")
 *  IDEMPOTENCY_CLEANUP_CRON  – Cron for idempotency cleanup (default: "0 3 * * *")
 *  INVOICE_OVERDUE_CRON      – Cron for invoice overdue check (default: "0 * * * *")
 *  DISABLE_CRON              – Set to "true" to disable all jobs (e.g. in test environments)
 */

import { schedule, validate, type ScheduledTask } from "node-cron";
import { runSettlementBatch } from "./settlementBatch.service";
import { processBillingCycle } from "./plan.service";
import { runSweepWithLock } from "./sweepCron.service";
import { funderMonitorService } from "./funderMonitor.service";
import { runPaymentExpiryReminderJob } from "./paymentExpiryReminder.service";
import { runPaymentExpiryJob } from "./paymentExpiry.service";
import { performDatabaseBackup } from "./dbBackup.service";
import { runInvoiceOverdueJob } from "./invoiceOverdue.service";
import { cleanupExpiredIdempotencyRecords } from "../middleware/idempotency.middleware";
import { DepositAddressService } from "./depositAddress.service";
import { getSweepCronInterval, logSweepConfigAtStartup } from "../config/sweep.config";
import { acquireCronLock, releaseCronLock } from "../utils/redisLock.util";

const SETTLEMENT_CRON_EXPR = process.env.SETTLEMENT_CRON ?? "0 0 * * *";
const BILLING_CRON_EXPR = process.env.BILLING_CRON ?? "0 1 * * *";
const SWEEP_CRON_EXPR = getSweepCronInterval();
const FUNDER_MONITOR_CRON_EXPR = process.env.FUNDER_MONITOR_CRON ?? "*/10 * * * *";
const CHECKOUT_REMINDER_CRON_EXPR = process.env.CHECKOUT_REMINDER_CRON ?? "*/2 * * * *";
const PAYMENT_EXPIRY_CRON_EXPR = process.env.PAYMENT_EXPIRY_CRON ?? "*/5 * * * *";
const DB_BACKUP_CRON_EXPR = process.env.DB_BACKUP_CRON ?? "0 2 * * *";
const INVOICE_OVERDUE_CRON_EXPR = process.env.INVOICE_OVERDUE_CRON ?? "0 * * * *";
const IDEMPOTENCY_CLEANUP_CRON_EXPR = process.env.IDEMPOTENCY_CLEANUP_CRON ?? "0 3 * * *";
const ADDRESS_POOL_CRON_EXPR = process.env.ADDRESS_POOL_CRON ?? "*/10 * * * *";

let settlementTask: ScheduledTask | null = null;
let billingTask: ScheduledTask | null = null;
let sweepTask: ScheduledTask | null = null;
let funderMonitorTask: ScheduledTask | null = null;
let checkoutReminderTask: ScheduledTask | null = null;
let paymentExpiryTask: ScheduledTask | null = null;
let dbBackupTask: ScheduledTask | null = null;
let invoiceOverdueTask: ScheduledTask | null = null;
let idempotencyCleanupTask: ScheduledTask | null = null;
let addressPoolTask: ScheduledTask | null = null;

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
    const acquired = await acquireCronLock("settlement");
    if (!acquired) {
      console.warn(`[Cron] ⚠️ Settlement batch lock held by another instance – skipping tick.`);
      return;
    }
    try {
      const result = await runSettlementBatch();
      console.log(`[Cron] ✅ Settlement batch ${result.batchId} finished – ${result.totalMerchantsSucceeded}/${result.totalMerchantsProcessed} merchants settled.`);
    } catch (err: any) {
      console.error(`[Cron] ❌ Settlement batch failed: ${err.message}`);
    } finally {
      await releaseCronLock("settlement");
    }
  }, { timezone: "UTC" });

  // ── Billing cycle ──────────────────────────────────────────────────────────
  billingTask = schedule(BILLING_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Billing cycle triggered at ${new Date().toISOString()}`);
    const acquired = await acquireCronLock("billing");
    if (!acquired) {
      console.warn(`[Cron] ⚠️ Billing cycle lock held by another instance – skipping tick.`);
      return;
    }
    try {
      const result = await processBillingCycle();
      console.log(`[Cron] ✅ Billing cycle finished – ${result.renewed}/${result.processed} renewed.`);
    } catch (err: any) {
      console.error(`[Cron] ❌ Billing cycle failed: ${err.message}`);
    } finally {
      await releaseCronLock("billing");
    }
  }, { timezone: "UTC" });

  // ── Sweep Job ──────────────────────────────────────────────────────────────
  logSweepConfigAtStartup();
  sweepTask = schedule(SWEEP_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Sweep triggered at ${new Date().toISOString()}`);
    await runSweepWithLock();
  }, { timezone: "UTC" });
  console.log(`[Cron] ✅ Sweep job scheduled (${SWEEP_CRON_EXPR}) in UTC.`);

  // ── Funder Monitor ─────────────────────────────────────────────────────────
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

  // ── Checkout Expiry Reminder ───────────────────────────────────────────────
  checkoutReminderTask = schedule(CHECKOUT_REMINDER_CRON_EXPR, async () => {
    const acquired = await acquireCronLock("checkout_reminder");
    if (!acquired) {
      console.warn(`[Cron] ⚠️ Checkout reminder lock held by another instance – skipping tick.`);
      return;
    }
    try {
      const result = await runPaymentExpiryReminderJob();
      if (result.processed > 0) {
        console.log(`[Cron] ✅ Checkout reminder — ${result.notified}/${result.processed} notified.`);
      }
    } catch (err: any) {
      console.error(`[Cron] ❌ Checkout reminder job failed: ${err.message}`);
    } finally {
      await releaseCronLock("checkout_reminder");
    }
  }, { timezone: "UTC" });

  // ── Payment Expiry Job (pending → expired) ─────────────────────────────────
  if (process.env.DISABLE_PAYMENT_EXPIRY_CRON !== "true") {
    if (validate(PAYMENT_EXPIRY_CRON_EXPR)) {
      paymentExpiryTask = schedule(
        PAYMENT_EXPIRY_CRON_EXPR,
        async () => {
          const acquired = await acquireCronLock("payment_expiry");
          if (!acquired) {
            console.warn(`[Cron] ⚠️ Payment expiry lock held by another instance – skipping tick.`);
            return;
          }
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
          } finally {
            await releaseCronLock("payment_expiry");
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

  // ── Database Daily Backup ──────────────────────────────────────────────────
  dbBackupTask = schedule(DB_BACKUP_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Database backup triggered at ${new Date().toISOString()}`);
    const acquired = await acquireCronLock("db_backup");
    if (!acquired) {
      console.warn(`[Cron] ⚠️ Database backup lock held by another instance – skipping tick.`);
      return;
    }
    try {
      await performDatabaseBackup();
    } finally {
      await releaseCronLock("db_backup");
    }
  }, { timezone: "UTC" });

  // ── Invoice Overdue Check ──────────────────────────────────────────────────
  invoiceOverdueTask = schedule(INVOICE_OVERDUE_CRON_EXPR, async () => {
    const acquired = await acquireCronLock("invoice_overdue");
    if (!acquired) {
      console.warn(`[Cron] ⚠️ Invoice overdue lock held by another instance – skipping tick.`);
      return;
    }
    try {
      const result = await runInvoiceOverdueJob();
      if (result.updated > 0) {
        console.log(`[Cron] ✅ Invoice overdue job — ${result.updated} invoice(s) marked overdue.`);
      }
    } catch (err: any) {
      console.error(`[Cron] ❌ Invoice overdue job failed: ${err.message}`);
    } finally {
      await releaseCronLock("invoice_overdue");
    }
  }, { timezone: "UTC" });

  // ── Idempotency Cleanup ────────────────────────────────────────────────────
  idempotencyCleanupTask = schedule(IDEMPOTENCY_CLEANUP_CRON_EXPR, async () => {
    console.log(`[Cron] ⏰ Idempotency cleanup triggered at ${new Date().toISOString()}`);
    const acquired = await acquireCronLock("idempotency_cleanup");
    if (!acquired) {
      console.warn(`[Cron] ⚠️ Idempotency cleanup lock held by another instance – skipping tick.`);
      return;
    }
    try {
      const deletedCount = await cleanupExpiredIdempotencyRecords();
      console.log(`[Cron] ✅ Idempotency cleanup — ${deletedCount} expired records deleted.`);
    } catch (err: any) {
      console.error(`[Cron] ❌ Idempotency cleanup failed: ${err.message}`);
    } finally {
      await releaseCronLock("idempotency_cleanup");
    }
  }, { timezone: "UTC" });

  // ── Address Pool ───────────────────────────────────────────────────────────
  addressPoolTask = schedule(ADDRESS_POOL_CRON_EXPR, async () => {
    const acquired = await acquireCronLock("address_pool");
    if (!acquired) {
      console.warn(`[Cron] ⚠️ Address pool lock held by another instance – skipping tick.`);
      return;
    }
    try {
      const recycled = await DepositAddressService.recycleAddresses();
      if (recycled > 0) {
        console.log(`[Cron] ✅ Address pool — recycled ${recycled} addresses.`);
      }
      const stats = await DepositAddressService.getPoolStats();
      if (stats.available < 100) {
        const toGenerate = 100 - stats.available;
        const generated = await DepositAddressService.generatePoolAddresses(toGenerate);
        console.log(`[Cron] ✅ Address pool — generated ${generated} new addresses.`);
      }
    } catch (err: any) {
      console.error(`[Cron] ❌ Address pool job failed: ${err.message}`);
    } finally {
      await releaseCronLock("address_pool");
    }
  }, { timezone: "UTC" });

  console.log("[Cron] All jobs scheduled successfully.");
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
    [invoiceOverdueTask, "Invoice overdue"],
    [idempotencyCleanupTask, "Idempotency cleanup"],
    [addressPoolTask, "Address pool"],
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
  invoiceOverdueTask = null;
  idempotencyCleanupTask = null;
  addressPoolTask = null;
}
