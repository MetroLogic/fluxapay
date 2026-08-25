/**
 * depositAddress.poolAlerting.test.ts
 *
 * Unit tests for DepositAddressService pool exhaustion and alerting (#751):
 * - getPoolStats() exposes allocatedCount, availableCount, utilizationPct
 * - Alert fires when utilizationPct >= 0.8 via settlementAlert.service.ts
 * - allocateAddress() returns a typed POOL_EXHAUSTED error above 95% or when depleted
 */

import { DepositAddressService, PoolExhaustedError } from "../../services/depositAddress.service";
import { sendDepositPoolAlert } from "../../services/settlementAlert.service";
import { ErrorCode } from "../../types/errors";

const mockPrisma: any = {
  depositAddress: {
    groupBy: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  $queryRaw: jest.fn(),
};

jest.mock("../../config/prisma", () => ({
  prisma: {
    depositAddress: {
      groupBy: jest.fn((...args: any[]) => mockPrisma.depositAddress.groupBy(...args)),
      create: jest.fn((...args: any[]) => mockPrisma.depositAddress.create(...args)),
      findUnique: jest.fn((...args: any[]) => mockPrisma.depositAddress.findUnique(...args)),
      update: jest.fn((...args: any[]) => mockPrisma.depositAddress.update(...args)),
    },
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
    $queryRaw: jest.fn((...args: any[]) => mockPrisma.$queryRaw(...args)),
  },
}));

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
  DepositAddressStatus: {
    available: "available",
    assigned: "assigned",
    cooldown: "cooldown",
    retiring: "retiring",
  },
}));

jest.mock("../../services/settlementAlert.service", () => ({
  sendDepositPoolAlert: jest.fn().mockResolvedValue(undefined),
}));

describe("DepositAddressService - Pool Exhaustion & Alerting (#751)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getPoolStats", () => {
    it("exposes allocatedCount, availableCount, totalCount, and utilizationPct", async () => {
      mockPrisma.depositAddress.groupBy.mockResolvedValueOnce([
        { status: "available", _count: { status: 3 } },
        { status: "assigned", _count: { status: 5 } },
        { status: "cooldown", _count: { status: 2 } },
      ]);

      const stats = await DepositAddressService.getPoolStats();

      expect(stats.available).toBe(3);
      expect(stats.availableCount).toBe(3);
      expect(stats.assigned).toBe(5);
      expect(stats.allocatedCount).toBe(5);
      expect(stats.cooldown).toBe(2);
      expect(stats.total).toBe(10);
      expect(stats.totalCount).toBe(10);
      // nonAvailable = 10 - 3 = 7, 7/10 = 0.7
      expect(stats.utilizationPct).toBe(0.7);
    });

    it("handles zero total count gracefully without division by zero", async () => {
      mockPrisma.depositAddress.groupBy.mockResolvedValueOnce([]);

      const stats = await DepositAddressService.getPoolStats();

      expect(stats.totalCount).toBe(0);
      expect(stats.availableCount).toBe(0);
      expect(stats.allocatedCount).toBe(0);
      expect(stats.utilizationPct).toBe(0);
    });
  });

  describe("allocateAddress - alerting threshold", () => {
    it("fires an alert when pool utilization is >= 80% (0.8)", async () => {
      // 2 available, 8 assigned -> total 10 -> utilization = 0.8
      mockPrisma.depositAddress.groupBy.mockResolvedValueOnce([
        { status: "available", _count: { status: 2 } },
        { status: "assigned", _count: { status: 8 } },
      ]);

      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: "addr_1", public_key: "GAVAILABLE123" },
      ]);
      mockPrisma.depositAddress.update.mockResolvedValueOnce({
        id: "addr_1",
        public_key: "GAVAILABLE123",
        status: "assigned",
      });

      const allocatedKey = await DepositAddressService.allocateAddress("pay_alert_test");

      expect(allocatedKey).toBe("GAVAILABLE123");
      expect(sendDepositPoolAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          utilizationPct: 0.8,
          availableCount: 2,
          totalCount: 10,
        }),
      );
    });

    it("does NOT fire an alert when pool utilization is < 80%", async () => {
      // 5 available, 5 assigned -> total 10 -> utilization = 0.5 (< 0.8)
      mockPrisma.depositAddress.groupBy.mockResolvedValueOnce([
        { status: "available", _count: { status: 5 } },
        { status: "assigned", _count: { status: 5 } },
      ]);

      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: "addr_2", public_key: "GAVAILABLE456" },
      ]);
      mockPrisma.depositAddress.update.mockResolvedValueOnce({
        id: "addr_2",
        public_key: "GAVAILABLE456",
        status: "assigned",
      });

      const allocatedKey = await DepositAddressService.allocateAddress("pay_normal_test");

      expect(allocatedKey).toBe("GAVAILABLE456");
      expect(sendDepositPoolAlert).not.toHaveBeenCalled();
    });
  });

  describe("allocateAddress - exhaustion threshold & typed 503 error", () => {
    it("throws typed PoolExhaustedError with status 503 when utilization is >= 95% (0.95)", async () => {
      // 1 available, 19 assigned -> total 20 -> utilization = 19/20 = 0.95
      mockPrisma.depositAddress.groupBy.mockResolvedValueOnce([
        { status: "available", _count: { status: 1 } },
        { status: "assigned", _count: { status: 19 } },
      ]);

      await expect(
        DepositAddressService.allocateAddress("pay_exhausted_test"),
      ).rejects.toThrow(PoolExhaustedError);

      try {
        mockPrisma.depositAddress.groupBy.mockResolvedValueOnce([
          { status: "available", _count: { status: 1 } },
          { status: "assigned", _count: { status: 19 } },
        ]);
        await DepositAddressService.allocateAddress("pay_exhausted_test");
      } catch (err: any) {
        expect(err).toBeInstanceOf(PoolExhaustedError);
        expect(err.status).toBe(503);
        expect(err.code).toBe(ErrorCode.POOL_EXHAUSTED);
        expect(err.retryAfterSeconds).toBe(30);
      }
    });

    it("throws typed PoolExhaustedError when totalCount > 0 but 0 available addresses remain in DB", async () => {
      // total = 10, but query returns 0 available rows
      mockPrisma.depositAddress.groupBy.mockResolvedValueOnce([
        { status: "assigned", _count: { status: 10 } },
      ]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        DepositAddressService.allocateAddress("pay_depleted_test"),
      ).rejects.toThrow(PoolExhaustedError);
    });
  });
});
