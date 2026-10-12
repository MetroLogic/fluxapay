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

jest.mock("../../helpers/request.helper", () => ({
  // Mirrors the real validateUserId: resolves req.merchantId (or req.user.id),
  // throws a 401 API error when the request is unauthenticated.
  validateUserId: jest.fn(async (req: { merchantId?: string; user?: { id?: string } }) => {
    const merchantId = req?.merchantId || req?.user?.id;
    if (!merchantId) {
      throw { status: 401, code: "UNAUTHORIZED", message: "Unauthorized" };
    }
    return merchantId;
  }),
}));

import { createPayment, getPaymentById, getPayments } from "../payment.controller";
import { PaymentService } from "../../services/payment.service";
import { validateUserId } from "../../helpers/request.helper";

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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "PAYMENT_RATE_LIMIT",
        message: "Rate limit exceeded. Please try again later.",
        retry_after_seconds: 60,
      }),
    );
    expect(PaymentService.createPayment).not.toHaveBeenCalled();
  });
});

describe("getPayments controller — test-mode partition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // validateUserId mock derives merchant from req.merchantId and throws 401
    // when absent (mirrors the real helper) — no override needed here.
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.payment.count.mockResolvedValue(0);
  });

  const buildReq = (isTestMode?: boolean) =>
    ({ merchantId: "merchant_1", isTestMode, query: {} }) as any;

  const buildRes = () => {
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return res;
  };

  it("live key lists only live payments (is_test_mode: false)", async () => {
    await getPayments(buildReq(false), buildRes());

    const where = prismaMock.payment.findMany.mock.calls[0][0].where;
    expect(where.is_test_mode).toBe(false);
    expect(prismaMock.payment.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ is_test_mode: false }) }),
    );
  });

  it("test key lists only test payments (is_test_mode: true)", async () => {
    await getPayments(buildReq(true), buildRes());

    const where = prismaMock.payment.findMany.mock.calls[0][0].where;
    expect(where.is_test_mode).toBe(true);
  });

  it("JWT dashboard requests are not mode-filtered", async () => {
    await getPayments(buildReq(undefined), buildRes());

    const where = prismaMock.payment.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("is_test_mode");
  });
});

/**
 * Issue #1208 — the transactions list endpoint returned slowly for merchants with
 * many payments. Three contributing causes are covered here: an unbounded `limit`,
 * an arbitrary client-supplied sort column, and a `search` filter referencing a
 * column that does not exist on the Payment model (which made `?search=` throw a
 * Prisma validation error at runtime).
 */
describe("getPayments controller — list performance and query safety (#1208)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.payment.count.mockResolvedValue(0);
  });

  const buildRes = () => {
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return res;
  };

  const reqWithQuery = (query: Record<string, unknown>) =>
    ({ merchantId: "merchant_1", isTestMode: false, query }) as any;

  it("defaults to page 1 with a limit of 10", async () => {
    const res = buildRes();
    await getPayments(reqWithQuery({}), res);

    const args = prismaMock.payment.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
    expect(args.take).toBe(10);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ page: 1, limit: 10 }) }),
    );
  });

  it("clamps limit to a maximum of 100 rows per page", async () => {
    const res = buildRes();
    await getPayments(reqWithQuery({ limit: "100000" }), res);

    expect(prismaMock.payment.findMany.mock.calls[0][0].take).toBe(100);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ limit: 100 }) }),
    );
  });

  it("falls back to the default limit for non-numeric or non-positive limits", async () => {
    await getPayments(reqWithQuery({ limit: "abc" }), buildRes());
    expect(prismaMock.payment.findMany.mock.calls[0][0].take).toBe(10);

    jest.clearAllMocks();
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.payment.count.mockResolvedValue(0);

    await getPayments(reqWithQuery({ limit: "-5" }), buildRes());
    expect(prismaMock.payment.findMany.mock.calls[0][0].take).toBe(10);
  });

  it("ignores an unknown sort_by and falls back to createdAt", async () => {
    await getPayments(reqWithQuery({ sort_by: "DROP TABLE" }), buildRes());

    const args = prismaMock.payment.findMany.mock.calls[0][0];
    expect(Object.keys(args.orderBy)).toEqual(["createdAt"]);
  });

  it("honours an allow-listed sort_by column", async () => {
    await getPayments(reqWithQuery({ sort_by: "amount", order: "asc" }), buildRes());

    const args = prismaMock.payment.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ amount: "asc" });
  });

  it("searches only fields that exist on the Payment model", async () => {
    await getPayments(reqWithQuery({ search: "buyer@example.com" }), buildRes());

    const where = prismaMock.payment.findMany.mock.calls[0][0].where;
    const searchedFields = where.OR.map((clause: Record<string, unknown>) => Object.keys(clause)[0]);
    // `order_id` was never a column on Payment, so referencing it made every
    // ?search= request fail with a Prisma validation error.
    expect(searchedFields).toEqual(["id", "customer_email"]);
    expect(searchedFields).not.toContain("order_id");
  });

  it("applies currency and status filters for the indexed list path", async () => {
    await getPayments(reqWithQuery({ status: "confirmed", currency: "USDC" }), buildRes());

    const where = prismaMock.payment.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("confirmed");
    expect(where.currency).toBe("USDC");
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
    expect(res.json).toHaveBeenCalledWith({
      code: "PAYMENT_NOT_FOUND",
      message: "Payment not found",
    });
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
    expect(res.json).toHaveBeenCalledWith({
      code: "PAYMENT_NOT_FOUND",
      message: "Payment not found",
    });
  });
});

// ---------------------------------------------------------------------------
// Issue #446 — Public Checkout DTO shape tests
// ---------------------------------------------------------------------------
import { buildPublicCheckoutDto } from "../payment.controller";

function makeCheckoutPayment(overrides: Partial<Parameters<typeof buildPublicCheckoutDto>[0]> = {}): Parameters<typeof buildPublicCheckoutDto>[0] {
  return {
    id: "pay_test_123",
    amount: 50,
    currency: "USDC",
    stellar_address: "GABCDEFG",
    expiration: new Date("2026-05-01T00:00:00Z"),
    status: "pending",
    success_url: "https://merchant.com/success",
    cancel_url: "https://merchant.com/cancel",
    description: "Test payment",
    metadata: {},
    merchant: {
      business_name: "Test Store",
      checkout_logo_url: "https://cdn.example.com/logo.png",
      checkout_accent_color: "#ff5500",
    },
    ...overrides,
  };
}

describe("buildPublicCheckoutDto — DTO shape and PII safety", () => {
  it("should include all whitelisted public fields", () => {
    const dto = buildPublicCheckoutDto(makeCheckoutPayment());

    expect(dto).toMatchObject({
      id: "pay_test_123",
      amount: 50,
      currency: "USDC",
      address: "GABCDEFG",
      status: "pending",
      successUrl: "https://merchant.com/success",
      cancelUrl: "https://merchant.com/cancel",
      merchantName: "Test Store",
      description: "Test payment",
      checkoutLogoUrl: "https://cdn.example.com/logo.png",
    });
    expect(typeof dto.expiresAt).toBe("string");
  });

  it("should never expose merchantId, customerId, or customer_email", () => {
    const paymentWithPii = {
      ...makeCheckoutPayment(),
      // These fields exist on the Prisma Payment model but must NOT appear in DTO.
      merchantId: "merchant_secret",
      customerId: "customer_secret",
      customer_email: "buyer@private.com",
    } as any;

    const dto = buildPublicCheckoutDto(paymentWithPii) as unknown as Record<string, unknown>;

    expect(dto).not.toHaveProperty("merchantId");
    expect(dto).not.toHaveProperty("customerId");
    expect(dto).not.toHaveProperty("customer_email");
  });

  it("should never expose internal fields like encrypted_key_data, payment_index, or derivation_path", () => {
    const paymentWithInternal = {
      ...makeCheckoutPayment(),
      encrypted_key_data: "SENSITIVE",
      payment_index: 42,
      derivation_path: "m/44'/148'/0'/0/42",
      order_id: "internal-order-99",
    } as any;

    const dto = buildPublicCheckoutDto(paymentWithInternal) as unknown as Record<string, unknown>;

    expect(dto).not.toHaveProperty("encrypted_key_data");
    expect(dto).not.toHaveProperty("payment_index");
    expect(dto).not.toHaveProperty("derivation_path");
    expect(dto).not.toHaveProperty("order_id");
  });

  it("should omit optional fields when they are null", () => {
    const dto = buildPublicCheckoutDto(
      makeCheckoutPayment({
        success_url: null,
        cancel_url: null,
        description: null,
        metadata: {},
        merchant: {
          business_name: "Minimal Store",
          checkout_logo_url: null,
          checkout_accent_color: null,
        },
      })
    );

    expect(dto).not.toHaveProperty("successUrl");
    expect(dto).not.toHaveProperty("cancelUrl");
    expect(dto).not.toHaveProperty("description");
    expect(dto).not.toHaveProperty("checkoutLogoUrl");
    expect(dto).not.toHaveProperty("checkoutAccentColor");
  });

  it("should surface memo fields from metadata when present", () => {
    const dto = buildPublicCheckoutDto(
      makeCheckoutPayment({
        metadata: { memo: "inv-001", memo_type: "text", memoRequired: true },
      })
    );

    expect(dto.memo).toBe("inv-001");
    expect(dto.memoType).toBe("text");
    expect(dto.memoRequired).toBe(true);
  });

  it("should convert amount to a plain number", () => {
    // Prisma returns Decimal objects; the DTO must be a JS number.
    const dto = buildPublicCheckoutDto(makeCheckoutPayment({ amount: 99.99 }));
    expect(typeof dto.amount).toBe("number");
    expect(dto.amount).toBe(99.99);
  });
});

// ---------------------------------------------------------------------------
// Issue #627 — Idempotency tests
// ---------------------------------------------------------------------------

jest.mock("../../middleware/idempotency.middleware", () => ({
  storeIdempotentResponse: jest.fn(),
}));

import { storeIdempotentResponse } from "../../middleware/idempotency.middleware";

describe("createPayment controller — idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should store idempotent response when idempotency key is present", async () => {
    (PaymentService.checkRateLimit as jest.Mock).mockResolvedValue(true);
    (PaymentService.createPayment as jest.Mock).mockResolvedValue({
      id: "pay_123",
      amount: 100,
      currency: "USDC",
      customer_email: "test@example.com",
      status: "pending",
      checkout_url: "https://checkout.example.com/pay_123",
    });

    const req: any = {
      merchantId: "merchant_1",
      idempotencyKey: "idem-key-123",
      body: {
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        metadata: {},
      },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await createPayment(req, res);

    expect(storeIdempotentResponse).toHaveBeenCalledWith(
      "idem-key-123",
      req.body,
      201,
      expect.objectContaining({ id: "pay_123" }),
      "merchant_1"
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("should not store idempotent response when idempotency key is absent", async () => {
    (PaymentService.checkRateLimit as jest.Mock).mockResolvedValue(true);
    (PaymentService.createPayment as jest.Mock).mockResolvedValue({
      id: "pay_456",
      amount: 200,
      currency: "USDC",
      customer_email: "test2@example.com",
      status: "pending",
      checkout_url: "https://checkout.example.com/pay_456",
    });

    const req: any = {
      merchantId: "merchant_1",
      idempotencyKey: undefined,
      body: {
        amount: 200,
        currency: "USDC",
        customer_email: "test2@example.com",
        metadata: {},
      },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await createPayment(req, res);

    expect(storeIdempotentResponse).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
