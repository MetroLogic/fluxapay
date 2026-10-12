/**
 * Invoice Idempotency Integration Test
 *
 * Verifies that POST /api/v1/invoices respects the Idempotency-Key header:
 *  - Duplicate requests within the window return the original 201 response
 *    with X-Idempotent-Replayed: true
 *  - Requests with a conflicting body (same key, different payload) return 422
 *  - Requests without a key are unaffected (still created normally)
 */

process.env.USDC_ISSUER_PUBLIC_KEY =
  process.env.USDC_ISSUER_PUBLIC_KEY ||
  "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.MASTER_VAULT_SECRET_KEY =
  "SA5V5N44OEQ5FDE3WIF5M7BHLD6NRLJ72S2VPEI5MY56PNTLIXA5YYG6";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    set: jest.fn().mockResolvedValue("OK"),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue("OK"),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  }));
});

jest.mock("../../middleware/apiKeyAuth.middleware", () => ({
  authenticateApiKey: (req: any, _res: any, next: any) => {
    req.merchantId = "merchant_idempotency_test";
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

const MOCK_INVOICE = {
  id: "inv_test_001",
  invoice_number: "INV-2026-0001",
  amount: "150",
  currency: "USDC",
  customer_email: "customer@example.com",
  status: "draft",
  payment_link: "https://pay.fluxapay.io/inv_test_001",
};

jest.mock("../../services/invoice.service", () => ({
  createInvoiceService: jest.fn().mockResolvedValue(MOCK_INVOICE),
  getInvoiceByIdService: jest.fn(),
  listInvoicesService: jest.fn(),
  exportInvoiceService: jest.fn(),
  updateInvoiceStatusService: jest.fn(),
  sendInvoiceService: jest.fn(),
  voidInvoiceService: jest.fn(),
}));

// Idempotency middleware uses Prisma — mock it so tests are self-contained
jest.mock("../../config/prisma", () => ({
  prisma: {
    idempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  },
}));

import request from "supertest";
import { app } from "../../app";
import { prisma } from "../../config/prisma";

const VALID_PAYLOAD = {
  amount: 150,
  currency: "USDC",
  customer_email: "customer@example.com",
};

describe("POST /api/v1/invoices — Idempotency-Key support", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates an invoice on first request (no idempotency key)", async () => {
    const res = await request(app)
      .post("/api/v1/invoices")
      .set("x-api-key", "test-key")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "inv_test_001" });
    expect(res.headers["x-idempotent-replayed"]).toBeUndefined();
  });

  it("creates an invoice on first request with idempotency key (cache miss)", async () => {
    // prisma.idempotencyRecord.findUnique returns null → cache miss
    const res = await request(app)
      .post("/api/v1/invoices")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", "key-unique-001")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "inv_test_001" });
    // Should have stored the response
    expect(prisma.idempotencyRecord.upsert).toHaveBeenCalled();
    expect(res.headers["x-idempotent-replayed"]).toBeUndefined();
  });

  it("replays the cached response on a duplicate request with the same Idempotency-Key", async () => {
    const idempotencyKey = "key-duplicate-002";
    const cachedResponse = MOCK_INVOICE;

    // First call: simulate cache hit (record already exists with matching hash)
    const crypto = require("crypto");
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(VALID_PAYLOAD))
      .digest("hex");

    (prisma.idempotencyRecord.findUnique as jest.Mock).mockResolvedValueOnce({
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      response_code: 201,
      response_body: cachedResponse,
      created_at: new Date(), // fresh — within TTL
      updated_at: new Date(),
    });

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", idempotencyKey)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "inv_test_001" });
    // Replay header must be set
    expect(res.headers["x-idempotent-replayed"]).toBe("true");
    // The real invoice service must NOT have been called again
    const { createInvoiceService } = require("../../services/invoice.service");
    expect(createInvoiceService).not.toHaveBeenCalled();
  });

  it("returns 422 when the same Idempotency-Key is reused with a different request body", async () => {
    const idempotencyKey = "key-conflict-003";

    // Simulate a record stored with a DIFFERENT body hash
    (prisma.idempotencyRecord.findUnique as jest.Mock).mockResolvedValueOnce({
      idempotency_key: idempotencyKey,
      request_hash: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      response_code: 201,
      response_body: MOCK_INVOICE,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const differentPayload = { ...VALID_PAYLOAD, amount: 999 }; // different body

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", idempotencyKey)
      .send(differentPayload);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects an Idempotency-Key longer than 255 characters with 400", async () => {
    const longKey = "x".repeat(256);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("x-api-key", "test-key")
      .set("Idempotency-Key", longKey)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });
});
