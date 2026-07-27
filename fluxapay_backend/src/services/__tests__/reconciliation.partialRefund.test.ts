/**
 * Tests for #814 — reconciliation service partial refund handling.
 *
 * Verifies that reconcileMerchant() subtracts completed refunds from the
 * expected balance so partially-refunded payments do not generate false-positive
 * discrepancy alerts.
 */

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockPaymentAggregate = jest.fn();
const mockSettlementAggregate = jest.fn();
const mockRefundAggregate = jest.fn();
const mockThresholdFindFirst = jest.fn();
const mockRecordUpsert = jest.fn();
const mockAlertFindFirst = jest.fn();
const mockAlertCreate = jest.fn();
const mockAlertFindMany = jest.fn();
const mockRecordUpdate = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockMerchantFindMany = jest.fn();

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    payment: {
      aggregate: mockPaymentAggregate,
      findMany: mockPaymentFindMany,
    },
    settlement: {
      aggregate: mockSettlementAggregate,
    },
    refund: {
      aggregate: mockRefundAggregate,
    },
    discrepancyThreshold: {
      findFirst: mockThresholdFindFirst,
    },
    reconciliationRecord: {
      upsert: mockRecordUpsert,
      update: mockRecordUpdate,
    },
    discrepancyAlert: {
      findFirst: mockAlertFindFirst,
      create: mockAlertCreate,
      findMany: mockAlertFindMany,
    },
    merchant: {
      findMany: mockMerchantFindMany,
    },
  })),
  AlertSeverity: {},
  PrismaClientKnownRequestError: class {},
  ReconciliationStatus: {},
}));

import { getReconciliationSummaryService } from "../reconciliation.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MERCHANT_ID = "merchant-recon-1";

function setupDefaults() {
  // No merchant-specific threshold → fall back to global zero thresholds
  mockThresholdFindFirst.mockResolvedValue(null);

  mockPaymentFindMany.mockResolvedValue([]); // no duplicate payments

  mockRecordUpsert.mockImplementation((_args: any) => {
    return Promise.resolve({
      id: "record-1",
      merchantId: MERCHANT_ID,
      expected_total: 0,
      actual_total: 0,
      discrepancy_amount: 0,
      discrepancy_percent: 0,
      status: "ok",
    });
  });

  mockAlertFindFirst.mockResolvedValue(null);
  mockAlertCreate.mockResolvedValue({});
  mockAlertFindMany.mockResolvedValue([]);
  mockRecordUpdate.mockResolvedValue({});
  mockMerchantFindMany.mockResolvedValue([{ id: MERCHANT_ID }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupDefaults();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("reconcileMerchant() — partial refund handling (#814)", () => {
  it("reports no discrepancy when a 30 USDC refund is subtracted from a 100 USDC payment", async () => {
    // Confirmed payments total: 100 USDC
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: 100 } });
    // Completed refunds total: 30 USDC  → expected balance = 70
    mockRefundAggregate.mockResolvedValue({ _sum: { amount: 30 } });
    // Actual settlements: 70 USDC  → no discrepancy
    mockSettlementAggregate.mockResolvedValue({ _sum: { amount: 70 } });

    // Make upsert echo back the computed values
    mockRecordUpsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ id: "record-1", status: create.status, ...create }),
    );

    const result = await getReconciliationSummaryService({
      merchant_id: MERCHANT_ID,
      period_start: "2026-01-01T00:00:00Z",
      period_end: "2026-01-31T23:59:59Z",
    });

    const record = result.data.records[0];
    // Expected = 100 - 30 = 70
    expect(record.expected_total).toBe(70);
    expect(record.actual_total).toBe(70);
    expect(record.discrepancy_amount).toBe(0);
    expect(record.status).toBe("ok");

    // No discrepancy alert should have been created
    expect(mockAlertCreate).not.toHaveBeenCalled();
  });

  it("correctly computes expected balance with no refunds (baseline)", async () => {
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: 200 } });
    mockRefundAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockSettlementAggregate.mockResolvedValue({ _sum: { amount: 200 } });

    mockRecordUpsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ id: "record-1", status: create.status, ...create }),
    );

    const result = await getReconciliationSummaryService({
      merchant_id: MERCHANT_ID,
      period_start: "2026-01-01T00:00:00Z",
      period_end: "2026-01-31T23:59:59Z",
    });

    const record = result.data.records[0];
    expect(record.expected_total).toBe(200);
    expect(record.status).toBe("ok");
    expect(mockAlertCreate).not.toHaveBeenCalled();
  });

  it("still raises a discrepancy when settlement does not match net amount after refund", async () => {
    // Payment 100, refund 30 → expected 70; but settlement only paid out 50 → discrepancy of 20
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: 100 } });
    mockRefundAggregate.mockResolvedValue({ _sum: { amount: 30 } });
    mockSettlementAggregate.mockResolvedValue({ _sum: { amount: 50 } });

    // Threshold: any discrepancy over 0 triggers an alert (amount_threshold=0, percent_threshold=0)
    mockThresholdFindFirst.mockResolvedValue({
      id: "thresh-1",
      amount_threshold: 0,
      percent_threshold: 0,
      is_active: true,
      merchantId: null,
    });

    mockRecordUpsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ id: "record-1", status: create.status, ...create }),
    );

    const result = await getReconciliationSummaryService({
      merchant_id: MERCHANT_ID,
      period_start: "2026-01-01T00:00:00Z",
      period_end: "2026-01-31T23:59:59Z",
    });

    const record = result.data.records[0];
    expect(record.expected_total).toBe(70);
    expect(record.actual_total).toBe(50);
    expect(record.discrepancy_amount).toBe(20);
    expect(record.status).toBe("discrepancy_detected");

    // A discrepancy alert must be created
    expect(mockAlertCreate).toHaveBeenCalledTimes(1);
  });

  it("queries refunds with status=completed scoped to the period", async () => {
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: 50 } });
    mockRefundAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockSettlementAggregate.mockResolvedValue({ _sum: { amount: 50 } });
    mockRecordUpsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ id: "record-1", status: create.status, ...create }),
    );

    const periodStart = "2026-02-01T00:00:00Z";
    const periodEnd = "2026-02-28T23:59:59Z";

    await getReconciliationSummaryService({
      merchant_id: MERCHANT_ID,
      period_start: periodStart,
      period_end: periodEnd,
    });

    expect(mockRefundAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchantId: MERCHANT_ID,
          status: "completed",
          created_at: {
            gte: new Date(periodStart),
            lte: new Date(periodEnd),
          },
        }),
        _sum: { amount: true },
      }),
    );
  });
});
