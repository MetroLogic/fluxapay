/**
 * cron.service.lockOverlap.test.ts
 *
 * Regression test for #1080: startCronJobs() must guard every scheduled job
 * with a Redis lock (acquire before running, release in a `finally`), and a
 * concurrent/overlapping tick must be skipped (not executed) while the lock
 * is held.
 *
 * This also guards against a real bug found while implementing this fix:
 * `acquireCronLock`/`releaseCronLock` each default to generating their own
 * "lock owner" id (which embeds `Date.now()`) when the caller doesn't pass
 * one explicitly. Two independent calls therefore produce two *different*
 * owner strings, so `releaseCronLock`'s ownership check would never match
 * and the lock would never actually be released — it would sit until its
 * TTL expired. The fix generates a single owner per tick (via
 * `getLockOwner()`) and passes it to both calls; these tests assert that.
 */

jest.mock("node-cron", () => {
  const scheduled: Array<{ expr: string; fn: () => Promise<void> | void }> = [];
  return {
    __scheduled: scheduled,
    schedule: jest.fn((expr: string, fn: () => Promise<void> | void) => {
      scheduled.push({ expr, fn });
      return { stop: jest.fn() };
    }),
    validate: jest.fn().mockReturnValue(true),
  };
});

jest.mock("../settlementBatch.service", () => ({
  runSettlementBatch: jest.fn().mockResolvedValue({
    batchId: "batch_1",
    totalMerchantsSucceeded: 1,
    totalMerchantsProcessed: 1,
  }),
}));
jest.mock("../plan.service", () => ({
  processBillingCycle: jest.fn().mockResolvedValue({ renewed: 0, processed: 0 }),
  sendUpcomingSubscriptionPriceChangeNotices: jest.fn().mockResolvedValue({ notified: 0, processed: 0 }),
}));
jest.mock("../sweepCron.service", () => ({
  runSweepWithLock: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../funderMonitor.service", () => ({
  funderMonitorService: { getBalanceStatus: jest.fn().mockResolvedValue({ ok: true }) },
}));
jest.mock("../paymentExpiryReminder.service", () => ({
  runPaymentExpiryReminderJob: jest.fn().mockResolvedValue({ notified: 0, processed: 0 }),
}));
jest.mock("../paymentExpiry.service", () => ({
  runPaymentExpiryJob: jest.fn().mockResolvedValue({ processed: 0, expired: 0, webhookErrors: [] }),
}));
jest.mock("../dbBackup.service", () => ({
  performDatabaseBackup: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../invoiceOverdue.service", () => ({
  runInvoiceOverdueJob: jest.fn().mockResolvedValue({ updated: 0 }),
}));
jest.mock("../../middleware/idempotency.middleware", () => ({
  cleanupExpiredIdempotencyRecords: jest.fn().mockResolvedValue(0),
}));
jest.mock("../depositAddress.service", () => ({
  DepositAddressService: {
    recycleAddresses: jest.fn().mockResolvedValue(0),
    getPoolStats: jest.fn().mockResolvedValue({ available: 100 }),
    generatePoolAddresses: jest.fn().mockResolvedValue(0),
  },
}));
jest.mock("../../config/sweep.config", () => ({
  getSweepCronInterval: jest.fn().mockReturnValue("*/10 * * * *"),
  logSweepConfigAtStartup: jest.fn(),
}));
jest.mock("../paymentSettlement.service", () => ({
  paymentSettlementService: {
    processPendingSettlementRetries: jest.fn().mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 }),
  },
}));

const mockAcquireCronLock = jest.fn();
const mockReleaseCronLock = jest.fn();
jest.mock("../../utils/redisLock.util", () => ({
  acquireCronLock: (...args: any[]) => mockAcquireCronLock(...args),
  releaseCronLock: (...args: any[]) => mockReleaseCronLock(...args),
  getLockOwner: jest.fn(() => `owner_${Math.random().toString(36).slice(2)}`),
}));

import { schedule } from "node-cron";
import { runSettlementBatch } from "../settlementBatch.service";
import { startCronJobs, stopCronJobs } from "../cron.service";

describe("cron.service — lock acquisition/release around scheduled jobs (#1080)", () => {
  const scheduleMock = schedule as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DISABLE_CRON;
  });

  afterEach(() => {
    stopCronJobs();
  });

  function getScheduledFn(matchExpr: string): () => Promise<void> {
    const call = scheduleMock.mock.calls.find((c) => c[0] === matchExpr);
    if (!call) throw new Error(`No job scheduled with expression ${matchExpr}`);
    return call[1];
  }

  it("acquires and releases the settlement lock using the SAME owner id for one tick", async () => {
    mockAcquireCronLock.mockResolvedValue(true);
    mockReleaseCronLock.mockResolvedValue(undefined);

    startCronJobs();
    const settlementFn = getScheduledFn(process.env.SETTLEMENT_CRON ?? "0 0 * * *");

    await settlementFn();

    expect(mockAcquireCronLock).toHaveBeenCalledTimes(1);
    expect(mockReleaseCronLock).toHaveBeenCalledTimes(1);

    const acquireOwner = mockAcquireCronLock.mock.calls[0][1].lockOwner;
    const releaseOwner = mockReleaseCronLock.mock.calls[0][1].lockOwner;
    expect(acquireOwner).toBeDefined();
    // The exact bug this guards against: acquire/release must use the same
    // owner, or the release's ownership check in redisLock.util can never
    // match and the lock is never actually freed.
    expect(releaseOwner).toBe(acquireOwner);

    expect(runSettlementBatch).toHaveBeenCalledTimes(1);
  });

  it("skips the job body entirely when the lock is already held (overlapping tick)", async () => {
    mockAcquireCronLock.mockResolvedValue(false);

    startCronJobs();
    const settlementFn = getScheduledFn(process.env.SETTLEMENT_CRON ?? "0 0 * * *");

    await settlementFn();

    expect(runSettlementBatch).not.toHaveBeenCalled();
    // A skipped tick must not attempt to release a lock it never acquired.
    expect(mockReleaseCronLock).not.toHaveBeenCalled();
  });

  it("still releases the lock (in a finally) when the job body throws", async () => {
    mockAcquireCronLock.mockResolvedValue(true);
    mockReleaseCronLock.mockResolvedValue(undefined);
    (runSettlementBatch as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    startCronJobs();
    const settlementFn = getScheduledFn(process.env.SETTLEMENT_CRON ?? "0 0 * * *");

    await settlementFn();

    expect(mockReleaseCronLock).toHaveBeenCalledTimes(1);
    const acquireOwner = mockAcquireCronLock.mock.calls[0][1].lockOwner;
    const releaseOwner = mockReleaseCronLock.mock.calls[0][1].lockOwner;
    expect(releaseOwner).toBe(acquireOwner);
  });
});
