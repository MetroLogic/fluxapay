const mockGetBalanceStatus = jest.fn();
const mockGetPoolDepthStatus = jest.fn();
const mockAcquireCronLock = jest.fn();
const mockReleaseCronLock = jest.fn();
const mockSendOpsAlert = jest.fn();
const mockTrackFunderBalanceLow = jest.fn();
const mockTrackAddressPoolDepleted = jest.fn();

jest.mock("../funderMonitor.service", () => ({
  funderMonitorService: {
    getBalanceStatus: mockGetBalanceStatus,
    getPoolDepthStatus: mockGetPoolDepthStatus,
  },
}));
jest.mock("../settlementAlert.service", () => ({ sendOpsAlert: mockSendOpsAlert }));
jest.mock("../../middleware/metrics.middleware", () => ({
  trackFunderBalanceLow: mockTrackFunderBalanceLow,
  trackAddressPoolDepleted: mockTrackAddressPoolDepleted,
}));
jest.mock("../../utils/redisLock.util", () => ({
  acquireCronLock: mockAcquireCronLock,
  releaseCronLock: mockReleaseCronLock,
}));
jest.mock("node-cron", () => ({
  schedule: jest.fn(),
  validate: jest.fn(() => true),
}));
jest.mock("../settlementBatch.service", () => ({ runSettlementBatch: jest.fn() }));
jest.mock("../plan.service", () => ({
  processBillingCycle: jest.fn(),
  sendUpcomingSubscriptionPriceChangeNotices: jest.fn(),
}));
jest.mock("../sweepCron.service", () => ({ runSweepWithLock: jest.fn() }));
jest.mock("../paymentExpiryReminder.service", () => ({ runPaymentExpiryReminderJob: jest.fn() }));
jest.mock("../paymentExpiry.service", () => ({ runPaymentExpiryJob: jest.fn() }));
jest.mock("../dbBackup.service", () => ({ performDatabaseBackup: jest.fn() }));
jest.mock("../invoiceOverdue.service", () => ({ runInvoiceOverdueJob: jest.fn() }));
jest.mock("../../middleware/idempotency.middleware", () => ({
  cleanupExpiredIdempotencyRecords: jest.fn(),
}));
jest.mock("../depositAddress.service", () => ({
  DepositAddressService: { recycleAddresses: jest.fn(), getPoolStats: jest.fn(), generatePoolAddresses: jest.fn() },
}));
jest.mock("../../config/sweep.config", () => ({
  getSweepCronInterval: jest.fn(() => "*/5 * * * *"),
  logSweepConfigAtStartup: jest.fn(),
}));
jest.mock("../paymentSettlement.service", () => ({
  paymentSettlementService: { processPendingSettlementRetries: jest.fn() },
}));

import { runFunderMonitorTask } from "../cron.service";

describe("runFunderMonitorTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquireCronLock.mockResolvedValue(true);
    mockReleaseCronLock.mockResolvedValue(undefined);
    mockSendOpsAlert.mockResolvedValue(undefined);
    mockGetBalanceStatus.mockResolvedValue({
      publicKey: "G_FUNDER",
      xlmBalance: 10,
      thresholdXlm: 20,
      ok: false,
    });
    mockGetPoolDepthStatus.mockResolvedValue({
      availableCount: 15,
      allocatedCount: 85,
      totalCount: 100,
      utilizationPct: 0.86,
      ok: false,
    });
  });

  it("checks balance and pool, increments both metrics, and sends configured ops alerts", async () => {
    await runFunderMonitorTask();

    expect(mockAcquireCronLock).toHaveBeenCalledWith("funder_monitor");
    expect(mockGetBalanceStatus).toHaveBeenCalledTimes(1);
    expect(mockGetPoolDepthStatus).toHaveBeenCalledTimes(1);
    expect(mockTrackFunderBalanceLow).toHaveBeenCalledTimes(1);
    expect(mockTrackAddressPoolDepleted).toHaveBeenCalledTimes(1);
    expect(mockSendOpsAlert).toHaveBeenCalledTimes(2);
    expect(mockSendOpsAlert).toHaveBeenCalledWith(
      "FunderMonitor",
      expect.stringContaining("10 XLM is below the 20 XLM threshold"),
    );
    expect(mockSendOpsAlert).toHaveBeenCalledWith(
      "FunderMonitor",
      expect.stringContaining("86.0%, above the 85% threshold"),
    );
    expect(mockReleaseCronLock).toHaveBeenCalledWith("funder_monitor");
  });

  it("does not alert or check statuses when another replica holds the lock", async () => {
    mockAcquireCronLock.mockResolvedValue(false);

    await runFunderMonitorTask();

    expect(mockGetBalanceStatus).not.toHaveBeenCalled();
    expect(mockGetPoolDepthStatus).not.toHaveBeenCalled();
    expect(mockSendOpsAlert).not.toHaveBeenCalled();
    expect(mockTrackFunderBalanceLow).not.toHaveBeenCalled();
    expect(mockTrackAddressPoolDepleted).not.toHaveBeenCalled();
    expect(mockReleaseCronLock).not.toHaveBeenCalled();
  });

  it("alerts only when pool utilization is greater than 85 percent", async () => {
    mockGetBalanceStatus.mockResolvedValue({
      publicKey: "G_FUNDER",
      xlmBalance: 25,
      thresholdXlm: 20,
      ok: true,
    });
    mockGetPoolDepthStatus.mockResolvedValue({
      availableCount: 15,
      allocatedCount: 85,
      totalCount: 100,
      utilizationPct: 0.85,
      ok: false,
    });

    await runFunderMonitorTask();

    expect(mockTrackFunderBalanceLow).not.toHaveBeenCalled();
    expect(mockTrackAddressPoolDepleted).not.toHaveBeenCalled();
    expect(mockSendOpsAlert).not.toHaveBeenCalled();
  });
});