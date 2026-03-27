// Jest hoists jest.mock calls above all imports and variable declarations.
// To share mock fn references, we use a module-scoped object that the factory closes over.
// This avoids the "Cannot access before initialization" error.

const prismaMock = {
  payment: {
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => prismaMock),
}));

jest.mock("../../services/payment.service", () => ({
  PaymentService: {
    getRateLimitWindowSeconds: jest.fn(),
    checkRateLimit: jest.fn(),
    createPayment: jest.fn(),
  },
}));

import { createPayment, getPaymentById } from "../payment.controller";
import { PaymentService } from "../../services/payment.service";

describe("createPayment controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 429 and Retry-After header when rate limit is exceeded", async () => {
    (PaymentService.getRateLimitWindowSeconds as jest.Mock).mockReturnValue(60);
    (PaymentService.checkRateLimit as jest.Mock).mockResolvedValue(false);

    const req: any = {
      merchantId: "merchant_1",
      body: {
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        metadata: {},
      },
    };

    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await createPayment(req, res);

    expect(PaymentService.checkRateLimit).toHaveBeenCalledWith("merchant_1");
    expect(PaymentService.getRateLimitWindowSeconds).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "60");
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Rate limit exceeded. Please try again later.",
    });
    expect(PaymentService.createPayment).not.toHaveBeenCalled();
  });
});

/**
 * Bug Condition Exploration Test — Property 1
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * This test MUST FAIL on unfixed code.
 * Failure confirms the bug: getPaymentById with merchantId=undefined returns 200 instead of 401.
 * Counterexample: getPaymentById({ merchantId: undefined, params: { id: 'pay_abc' } })
 *   → controller proceeds past the missing guard and returns 200 with payment data (data leak)
 */
describe("getPaymentById controller — bug condition exploration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 when merchantId is undefined (unauthenticated request)", async () => {
    prismaMock.payment.findFirst.mockResolvedValue({
      id: "pay_abc",
      merchantId: "merchant_1",
      amount: 100,
      currency: "USDC",
      status: "pending",
      customer_email: "test@example.com",
      createdAt: new Date(),
      merchant: { id: "merchant_1", name: "Test Merchant" },
    });

    const req: any = {
      merchantId: undefined, // Bug condition: no auth middleware set this
      params: { id: "pay_abc" },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getPaymentById(req, res);

    // FAILS on unfixed code — controller proceeds to Prisma and returns 200 with payment data
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

/**
 * Preservation Tests — Property 2
 * Validates: Requirements 3.1, 3.3
 *
 * These tests MUST PASS on both unfixed and fixed code.
 * They confirm that authenticated, merchant-scoped requests behave correctly.
 */
describe("getPaymentById controller — preservation tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 with payment data when merchantId matches the payment", async () => {
    const payment = {
      id: "pay_123",
      merchantId: "merchant_1",
      amount: 500,
      currency: "USDC",
      status: "confirmed",
      customer_email: "buyer@example.com",
      createdAt: new Date(),
      merchant: { id: "merchant_1", name: "Merchant One" },
    };
    prismaMock.payment.findFirst.mockResolvedValue(payment);

    const req: any = {
      merchantId: "merchant_1",
      params: { id: "pay_123" },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getPaymentById(req, res);

    expect(prismaMock.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "pay_123", merchantId: "merchant_1" }),
      })
    );
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "pay_123" }));
  });

  it("should return 404 when payment does not exist for the authenticated merchant", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);

    const req: any = {
      merchantId: "merchant_1",
      params: { id: "pay_nonexistent" },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getPaymentById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Payment not found" });
  });

  it("should return 404 when payment belongs to a different merchant (cross-merchant access)", async () => {
    // Prisma returns null because { id, merchantId } filter excludes the other merchant's payment
    prismaMock.payment.findFirst.mockResolvedValue(null);

    const req: any = {
      merchantId: "merchant_2",
      params: { id: "pay_belongs_to_merchant_1" },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getPaymentById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Payment not found" });
  });
});
