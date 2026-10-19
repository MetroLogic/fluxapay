/**
 * Payment Idempotency Integration Test
 *
 * Verifies that POST /api/v1/payments respects the Idempotency-Key header
 * using the Redis-backed idempotency middleware.
 *
 * Uses a minimal Express app containing only the payment router to avoid
 * pre-existing issues in unrelated routes (swagger YAML, missing handlers).
 */

// ── Env setup — must come before any imports that read process.env ──────────
process.env.USDC_ISSUER_PUBLIC_KEY =
  process.env.USDC_ISSUER_PUBLIC_KEY ||
  "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.ADMIN_JWT_SECRET = "test-admin-jwt-secret";
process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.MASTER_VAULT_SECRET_KEY =
  "SA5V5N44OEQ5FDE3WIF5M7BHLD6NRLJ72S2VPEI5MY56PNTLIXA5YYG6";
process.env.FUNDER_SECRET_KEY =
  "SA5V5N44OEQ5FDE3WIF5M7BHLD6NRLJ72S2VPEI5MY56PNTLIXA5YYG6";
process.env.HD_WALLET_MASTER_SEED = "test-seed-xyz";
process.env.KMS_PROVIDER = "local";

// ── Redis mock with real Map-backed NX semantics ──────────────────────────────
jest.mock("ioredis", () => {
  const store = new Map<string, string>();

  return jest.fn().mockImplementation(() => ({
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return "OK";
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    keys: jest.fn(async () => Array.from(store.keys())),
    quit: jest.fn().mockResolvedValue("OK"),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  }));
});

// ── Middleware mocks ──────────────────────────────────────────────────────────
jest.mock("../../middleware/apiKeyAuth.middleware", () => ({
  authenticateApiKey: (req: any, _res: any, next: any) => {
    req.merchantId = "merchant_idempotency_payment_test";
    next();
  },
}));

jest.mock("../../middleware/rateLimit.middleware", () => ({
  merchantApiKeyRateLimit: () => (_req: any, _res: any, next: any) => next(),
  globalRateLimit: () => (_req: any, _res: any, next: any) => next(),
  merchantRateLimit: () => (_req: any, _res: any, next: any) => next(),
  authRateLimit: () => (_req: any, _res: any, next: any) => next(),
  adminRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../middleware/kycGate.middleware", () => ({
  kycGateMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// ── Controller mock — stubs missing exports so the route file loads cleanly ──
// The real controller is missing several exports; stub them to avoid Express
// "handler must be a function" errors when the router is initialised.
jest.mock("../../controllers/payment.controller", () => {
  const actual = jest.requireActual("../../controllers/payment.controller");
  const noop = (_req: any, res: any) => res.status(501).json({ code: "NOT_IMPLEMENTED" });
  return {
    ...actual,
    updatePayment: noop,
    getPaymentStatus: noop,
    streamPaymentStatus: noop,
    getPublicCheckoutPayment: noop,
    getPublicCheckoutPaymentStatus: noop,
    getPaymentSettlement: noop,
  };
});

// ── Controller mock — stubs missing exports so the route file loads cleanly ──
jest.mock("../../controllers/payment.controller", () => {
  const actual = jest.requireActual("../../controllers/payment.controller");
  const noop = (_req: any, res: any) => res.status(501).json({ code: "NOT_IMPLEMENTED" });
  return {
    ...actual,
    updatePayment: noop,
    getPaymentStatus: noop,
    streamPaymentStatus: noop,
    getPublicCheckoutPayment: noop,
    getPublicCheckoutPaymentStatus: noop,
    getPaymentSettlement: noop,
  };
});

// ── Service mocks ─────────────────────────────────────────────────────────────
jest.mock("../../services/payment.service", () => ({
  PaymentService: {
    checkRateLimit: jest.fn().mockResolvedValue(true),
    getRateLimitWindowSeconds: jest.fn().mockReturnValue(60),
    createPayment: jest.fn().mockResolvedValue({
      id: "pay_idempotency_test_001",
      amount: 100,
      currency: "USDC",
      status: "pending",
      customer_email: "customer@example.com",
      checkout_url: "https://pay.fluxapay.io/pay_idempotency_test_001",
      stellar_address: "GBUQWP3BOUZX34ULNQG23RQ6F5DOBAB4NSTOF5AUFF6GPBK476QC6G5",
      expires_at: new Date("2026-12-31T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  },
}));

jest.mock("../../services/EventService", () => ({
  eventBus: { emit: jest.fn() },
  AppEvents: { PAYMENT_CONFIRMED: "payment_confirmed" },
}));

jest.mock("../../services/paymentSettlement.service", () => ({
  paymentSettlementService: { getSettlementForPayment: jest.fn() },
}));

// ── Prisma mock ───────────────────────────────────────────────────────────────
const prismaMock = {
  customer: { findFirst: jest.fn().mockResolvedValue(null) },
  payment: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};
jest.mock("../../config/database", () => ({ prisma: prismaMock }));
jest.mock("../../config/prisma", () => ({ prisma: prismaMock }));

// ── Imports ───────────────────────────────────────────────────────────────────
import express from "express";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import paymentRouter from "../../routes/payment.route";
import { redisClient } from "../../middleware/redisIdempotency.middleware";
import { PaymentService } from "../../services/payment.service";

// Build a minimal Express app that only mounts the payment router
const app = express();
app.use(express.json());
app.use("/api/v1/payments", paymentRouter);

const VALID_PAYLOAD = {
  amount: 100,
  currency: "USDC",
  customer_email: "customer@example.com",
};

describe("POST /api/v1/payments — Idempotency-Key support", () => {
  afterAll(async () => {
    await redisClient.quit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Missing key ───────────────────────────────────────────────────────────

  it("returns 400 MISSING_IDEMPOTENCY_KEY when Idempotency-Key header is omitted", async () => {
    const res = await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  // ── Invalid key format ────────────────────────────────────────────────────

  it("returns 400 INVALID_IDEMPOTENCY_KEY when Idempotency-Key is not a UUID v4", async () => {
    const res = await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", "not-a-valid-uuid")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  // ── Cache miss — fresh request ────────────────────────────────────────────

  it("creates a new payment on the first request (cache miss)", async () => {
    const key = uuidv4();

    const res = await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", key)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "pay_idempotency_test_001" });
    expect(res.headers["idempotency-replayed"]).toBeUndefined();
    expect(PaymentService.createPayment).toHaveBeenCalledTimes(1);
  });

  // ── Replay — completed request ────────────────────────────────────────────

  it("replays the cached 201 response with Idempotency-Replayed: true on duplicate", async () => {
    const key = uuidv4();

    // First request — creates the payment and populates Redis
    const res1 = await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", key)
      .send(VALID_PAYLOAD);

    expect(res1.status).toBe(201);
    expect(res1.headers["idempotency-replayed"]).toBeUndefined();

    // Second request with same key and body — must replay from cache
    const res2 = await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", key)
      .send(VALID_PAYLOAD);

    expect(res2.status).toBe(201);
    expect(res2.body).toMatchObject({ id: "pay_idempotency_test_001" });
    expect(res2.headers["idempotency-replayed"]).toBe("true");
    // Payment service must only have been called once
    expect(PaymentService.createPayment).toHaveBeenCalledTimes(1);
  });

  it("replays using the original status code (201), not 200", async () => {
    const key = uuidv4();

    await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", key)
      .send(VALID_PAYLOAD);

    const res = await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", key)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
  });

  // ── Payload mismatch ──────────────────────────────────────────────────────

  it("returns 422 IDEMPOTENCY_CONFLICT when same key is reused with a different payload", async () => {
    const key = uuidv4();

    // First request — caches with the original payload
    await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", key)
      .send(VALID_PAYLOAD);

    // Second request — same key, different amount
    const differentPayload = { ...VALID_PAYLOAD, amount: 9999 };
    const res = await request(app)
      .post("/api/v1/payments")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", key)
      .send(differentPayload);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("IDEMPOTENCY_CONFLICT");
    // Only called once (for the original request)
    expect(PaymentService.createPayment).toHaveBeenCalledTimes(1);
  });
});
