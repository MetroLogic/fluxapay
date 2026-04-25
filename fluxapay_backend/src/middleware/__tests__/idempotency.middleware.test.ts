import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/client/client";
import {
  idempotencyMiddleware,
  storeIdempotentResponse,
  cleanupExpiredIdempotencyRecords,
  IdempotentRequest,
} from "../idempotency.middleware";

jest.mock("../../generated/client/client", () => {
  const mockPrisma = {
    idempotencyRecord: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

describe("Idempotency Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();

    mockReq = {
      headers: {},
      body: { amount: 100, currency: "USDC" },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe("idempotencyMiddleware", () => {
    it("should proceed without idempotency key", async () => {
      await idempotencyMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
      expect(prisma.idempotencyRecord.findUnique).not.toHaveBeenCalled();
    });

    it("should reject invalid idempotency key", async () => {
      mockReq.headers = { "idempotency-key": "" };

      await idempotencyMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining("Invalid Idempotency-Key"),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return cached response for duplicate request", async () => {
      const idempotencyKey = "test-key-123";
      mockReq.headers = { "idempotency-key": idempotencyKey };

      const cachedResponse = {
        id: "payment_123",
        amount: 100,
        currency: "USDC",
      };

      prisma.idempotencyRecord.findUnique.mockResolvedValue({
        idempotency_key: idempotencyKey,
        request_hash: expect.any(String),
        response_code: 201,
        response_body: cachedResponse,
        created_at: new Date(),
      });

      await idempotencyMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(cachedResponse);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject conflicting request body", async () => {
      const idempotencyKey = "test-key-123";
      mockReq.headers = { "idempotency-key": idempotencyKey };

      prisma.idempotencyRecord.findUnique.mockResolvedValue({
        idempotency_key: idempotencyKey,
        request_hash: "different-hash",
        response_code: 201,
        response_body: {},
        created_at: new Date(),
      });

      await idempotencyMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining("Idempotency key conflict"),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should proceed for new idempotency key", async () => {
      const idempotencyKey = "test-key-123";
      mockReq.headers = { "idempotency-key": idempotencyKey };

      prisma.idempotencyRecord.findUnique.mockResolvedValue(null);

      await idempotencyMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect((mockReq as IdempotentRequest).idempotencyKey).toBe(
        idempotencyKey,
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it("should delete expired record and proceed", async () => {
      const idempotencyKey = "test-key-123";
      mockReq.headers = { "idempotency-key": idempotencyKey };

      // Record created 25 hours ago (expired)
      const expiredDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

      prisma.idempotencyRecord.findUnique.mockResolvedValue({
        idempotency_key: idempotencyKey,
        request_hash: expect.any(String),
        response_code: 201,
        response_body: {},
        created_at: expiredDate,
      });

      await idempotencyMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(prisma.idempotencyRecord.delete).toHaveBeenCalledWith({
        where: { idempotency_key: idempotencyKey },
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("storeIdempotentResponse", () => {
    it("should store response successfully", async () => {
      const idempotencyKey = "test-key-123";
      const requestBody = { amount: 100 };
      const responseBody = { id: "payment_123" };

      await storeIdempotentResponse(
        idempotencyKey,
        requestBody,
        201,
        responseBody,
        "merchant_123",
      );

      expect(prisma.idempotencyRecord.upsert).toHaveBeenCalledWith({
        where: { idempotency_key: idempotencyKey },
        create: expect.objectContaining({
          idempotency_key: idempotencyKey,
          user_id: "merchant_123",
          response_code: 201,
          response_body: responseBody,
        }),
        update: expect.objectContaining({
          response_code: 201,
          response_body: responseBody,
        }),
      });
    });

    it("should handle storage errors gracefully", async () => {
      prisma.idempotencyRecord.upsert.mockRejectedValue(
        new Error("Database error"),
      );

      // Should not throw
      await expect(
        storeIdempotentResponse("key", {}, 200, {}),
      ).resolves.not.toThrow();
    });
  });

  describe("cleanupExpiredIdempotencyRecords", () => {
    it("should delete expired records", async () => {
      prisma.idempotencyRecord.deleteMany.mockResolvedValue({ count: 5 });

      const count = await cleanupExpiredIdempotencyRecords();

      expect(count).toBe(5);
      expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
        where: {
          created_at: { lt: expect.any(Date) },
        },
      });
    });
  });
});
