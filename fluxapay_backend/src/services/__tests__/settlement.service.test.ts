/**
 * settlement.service.test.ts
 *
 * Tests for settlement query and export services
 */

import {
  listSettlementsService,
  getSettlementDetailsService,
  getSettlementSummaryService,
  exportSettlementService,
  getSettlementBatchService,
} from "../settlement.service";
import { PrismaClient } from "../../generated/client/client";

// Mock Prisma
const mockPrisma = {
  settlement: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe("settlement.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listSettlementsService", () => {
    it("should list settlements with pagination", async () => {
      const mockSettlements = [
        {
          id: "settlement_1",
          merchantId: "merchant_1",
          amount: 155000,
          currency: "NGN",
          status: "completed",
          created_at: new Date(),
        },
      ];

      mockPrisma.settlement.findMany.mockResolvedValue(mockSettlements);
      mockPrisma.settlement.count.mockResolvedValue(1);

      const result = await listSettlementsService({
        merchantId: "merchant_1",
        page: 1,
        limit: 10,
      });

      expect(result.settlements).toEqual(mockSettlements);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pages).toBe(1);
    });

    it("should filter by status", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await listSettlementsService({
        merchantId: "merchant_1",
        page: 1,
        limit: 10,
        status: "completed",
      });

      expect(mockPrisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "completed",
          }),
        })
      );
    });

    it("should filter by currency", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await listSettlementsService({
        merchantId: "merchant_1",
        page: 1,
        limit: 10,
        currency: "NGN",
      });

      expect(mockPrisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            currency: "NGN",
          }),
        })
      );
    });

    it("should filter by date range", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await listSettlementsService({
        merchantId: "merchant_1",
        page: 1,
        limit: 10,
        date_from: "2024-01-01",
        date_to: "2024-01-31",
      });

      expect(mockPrisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe("getSettlementDetailsService", () => {
    it("should return settlement details with payments", async () => {
      const mockSettlement = {
        id: "settlement_1",
        merchantId: "merchant_1",
        amount: 155000,
        currency: "NGN",
        merchant: {
          id: "merchant_1",
          business_name: "Test Business",
        },
      };

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: 100,
          status: "confirmed",
        },
      ];

      mockPrisma.settlement.findUnique.mockResolvedValue(mockSettlement);
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);

      const result = await getSettlementDetailsService("merchant_1", "settlement_1");

      expect(result.id).toBe("settlement_1");
      expect(result.payments).toEqual(mockPayments);
    });

    it("should throw error if settlement not found", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(
        getSettlementDetailsService("merchant_1", "settlement_1")
      ).rejects.toThrow("Settlement not found");
    });
  });

  describe("getSettlementSummaryService", () => {
    it("should return settlement summary for current month", async () => {
      mockPrisma.settlement.aggregate.mockResolvedValue({
        _sum: {
          amount: 500000,
          fees: 10000,
        },
      });

      mockPrisma.settlement.findMany.mockResolvedValue([
        {
          created_at: new Date("2024-01-01"),
          processed_date: new Date("2024-01-02"),
        },
        {
          created_at: new Date("2024-01-05"),
          processed_date: new Date("2024-01-06"),
        },
      ]);

      const result = await getSettlementSummaryService("merchant_1");

      expect(result.total_settled_this_month).toBe(500000);
      expect(result.total_fees_paid).toBe(10000);
      expect(result.average_settlement_time_days).toBeGreaterThanOrEqual(0);
      expect(result.next_settlement_date).toBeInstanceOf(Date);
    });
  });

  describe("exportSettlementService", () => {
    const mockSettlement = {
      id: "settlement_1",
      merchantId: "merchant_1",
      amount: 155000,
      fees: 3100,
      currency: "NGN",
      status: "completed",
      bank_transfer_id: "transfer_123",
      scheduled_date: new Date("2024-01-15"),
      processed_date: new Date("2024-01-15"),
      created_at: new Date("2024-01-15"),
      merchant: {
        business_name: "Test Business",
      },
    };

    const mockPayments = [
      {
        id: "payment_1",
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        createdAt: new Date("2024-01-14"),
        status: "confirmed",
      },
    ];

    beforeEach(() => {
      mockPrisma.settlement.findUnique.mockResolvedValue(mockSettlement);
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
    });

    it("should export settlement as CSV", async () => {
      const result = await exportSettlementService("merchant_1", "settlement_1", "csv");

      expect(result.filename).toContain(".csv");
      expect(result.contentType).toBe("text/csv");
      expect(result.content).toContain("Settlement Report");
      expect(result.content).toContain("Test Business");
      expect(result.content).toContain("payment_1");
    });

    it("should export settlement as PDF data", async () => {
      const result = await exportSettlementService("merchant_1", "settlement_1", "pdf");

      expect(result.filename).toContain(".pdf");
      expect(result.contentType).toBe("application/json");
      expect(result.content.settlement).toBeDefined();
      expect(result.content.payments).toHaveLength(1);
    });

    it("should throw error if settlement not found", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(
        exportSettlementService("merchant_1", "settlement_1", "csv")
      ).rejects.toThrow("Settlement not found");
    });
  });

  describe("getSettlementBatchService", () => {
    it("should group settlements by batch date", async () => {
      const mockSettlements = [
        {
          scheduled_date: new Date("2024-01-15"),
          amount: 100000,
          fees: 2000,
          status: "completed",
        },
        {
          scheduled_date: new Date("2024-01-15"),
          amount: 50000,
          fees: 1000,
          status: "completed",
        },
        {
          scheduled_date: new Date("2024-01-16"),
          amount: 75000,
          fees: 1500,
          status: "completed",
        },
      ];

      mockPrisma.settlement.findMany.mockResolvedValue(mockSettlements);

      const result = await getSettlementBatchService("merchant_1");

      expect(result.batches).toHaveLength(2);
      expect(result.batches[0].settlement_count).toBeGreaterThan(0);
    });

    it("should filter by date range", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);

      await getSettlementBatchService("merchant_1", "2024-01-01", "2024-01-31");

      expect(mockPrisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduled_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });
});
