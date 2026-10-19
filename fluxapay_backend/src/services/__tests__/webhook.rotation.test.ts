/**
 * webhook.rotation.test.ts
 *
 * Tests for configurable webhook signature rotation (#1343):
 *  - initiateWebhookKeyRotation: generates a new secondary secret
 *  - promoteSecondaryWebhookKey: promotes secondary → primary
 *  - revokeSecondaryWebhookKey:  cancels rotation
 *  - getWebhookKeyStatusService: reports rotation status without exposing secrets
 *  - deliverWebhook:             dual-signs when secondary secret is present
 *  - sendPaymentWebhook:         dual-signs via WebhookDispatcher
 */

import crypto from "crypto";

// ── Mock Prisma ────────────────────────────────────────────────────────────────
const mockMerchantStore: Record<string, any> = {};

const mockPrisma = {
  merchant: {
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(mockMerchantStore[where.id] ?? null),
    ),
    update: jest.fn(({ where, data }: { where: { id: string }; data: any }) => {
      mockMerchantStore[where.id] = {
        ...mockMerchantStore[where.id],
        ...data,
      };
      return Promise.resolve(mockMerchantStore[where.id]);
    }),
  },
};

jest.mock("../../config/prisma", () => ({ prisma: mockPrisma }));

// ── Mock fetch for deliverWebhook tests ───────────────────────────────────────
global.fetch = jest.fn();

// ── Mock metrics (prevents import side-effects) ───────────────────────────────
jest.mock("../../middleware/metrics.middleware", () => ({
  trackWebhookDelivery: jest.fn(),
}));

// ── Import after mocks are set ────────────────────────────────────────────────
const {
  generateWebhookSignature,
  initiateWebhookKeyRotation,
  promoteSecondaryWebhookKey,
  revokeSecondaryWebhookKey,
  getWebhookKeyStatusService,
  deliverWebhook,
  WebhookDispatcher,
} = require("../webhook.service");

// Helper to create a fresh merchant fixture
function makeMerchant(overrides: Record<string, any> = {}) {
  return {
    id: "merch_test_01",
    webhook_secret: "primary_secret_abc123",
    webhook_secret_secondary: null,
    webhook_secret_secondary_created_at: null,
    webhook_url: "https://example.com/webhooks",
    business_name: "Test Merchant",
    email: "merchant@example.com",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// initiateWebhookKeyRotation
// ─────────────────────────────────────────────────────────────────────────────

describe("initiateWebhookKeyRotation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const m = makeMerchant();
    mockMerchantStore[m.id] = { ...m };
  });

  it("generates a secondary secret and returns it (once)", async () => {
    const result = await initiateWebhookKeyRotation("merch_test_01");

    expect(result.data.secondary_secret).toBeDefined();
    expect(result.data.secondary_secret).toMatch(/^whsec_/);
    expect(result.data.secondary_created_at).toBeInstanceOf(Date);
    expect(result.message).toMatch(/rotation initiated/i);
  });

  it("persists secondary secret in the merchant store", async () => {
    await initiateWebhookKeyRotation("merch_test_01");
    expect(mockPrisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhook_secret_secondary: expect.stringMatching(/^whsec_/),
          webhook_secret_secondary_created_at: expect.any(Date),
        }),
      }),
    );
  });

  it("generates a unique secret every time", async () => {
    const m = makeMerchant({ id: "merch_a" });
    mockMerchantStore["merch_a"] = { ...m };
    const n = makeMerchant({ id: "merch_b" });
    mockMerchantStore["merch_b"] = { ...n };

    const r1 = await initiateWebhookKeyRotation("merch_a");
    const r2 = await initiateWebhookKeyRotation("merch_b");

    expect(r1.data.secondary_secret).not.toBe(r2.data.secondary_secret);
  });

  it("rejects with 409 if a rotation is already in progress", async () => {
    // Pre-seed a secondary secret
    mockMerchantStore["merch_test_01"].webhook_secret_secondary = "whsec_existing";

    await expect(initiateWebhookKeyRotation("merch_test_01")).rejects.toMatchObject({
      status: 409,
      code: "WEBHOOK_ROTATION_IN_PROGRESS",
    });
  });

  it("rejects with 404 if merchant does not exist", async () => {
    await expect(initiateWebhookKeyRotation("merch_ghost")).rejects.toMatchObject({
      status: 404,
      code: "MERCHANT_NOT_FOUND",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// promoteSecondaryWebhookKey
// ─────────────────────────────────────────────────────────────────────────────

describe("promoteSecondaryWebhookKey", () => {
  const secondarySecret = "whsec_new_secret_xyz";

  beforeEach(() => {
    jest.clearAllMocks();
    mockMerchantStore["merch_test_01"] = makeMerchant({
      webhook_secret_secondary: secondarySecret,
      webhook_secret_secondary_created_at: new Date(),
    });
  });

  it("moves secondary to primary and clears secondary fields", async () => {
    await promoteSecondaryWebhookKey("merch_test_01");

    expect(mockPrisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhook_secret: secondarySecret,
          webhook_secret_secondary: null,
          webhook_secret_secondary_created_at: null,
        }),
      }),
    );
  });

  it("returns a successful promotion message", async () => {
    const result = await promoteSecondaryWebhookKey("merch_test_01");
    expect(result.message).toMatch(/promoted to primary/i);
    expect(result.data.promoted_at).toBeDefined();
  });

  it("rejects with 400 when no rotation is in progress", async () => {
    mockMerchantStore["merch_test_01"].webhook_secret_secondary = null;

    await expect(promoteSecondaryWebhookKey("merch_test_01")).rejects.toMatchObject({
      status: 400,
      code: "WEBHOOK_NO_SECONDARY_KEY",
    });
  });

  it("rejects with 404 if merchant does not exist", async () => {
    await expect(promoteSecondaryWebhookKey("merch_ghost")).rejects.toMatchObject({
      status: 404,
      code: "MERCHANT_NOT_FOUND",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// revokeSecondaryWebhookKey
// ─────────────────────────────────────────────────────────────────────────────

describe("revokeSecondaryWebhookKey", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMerchantStore["merch_test_01"] = makeMerchant({
      webhook_secret_secondary: "whsec_to_be_revoked",
      webhook_secret_secondary_created_at: new Date(),
    });
  });

  it("clears secondary secret without changing primary", async () => {
    const primaryBefore = mockMerchantStore["merch_test_01"].webhook_secret;
    await revokeSecondaryWebhookKey("merch_test_01");

    expect(mockPrisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhook_secret_secondary: null,
          webhook_secret_secondary_created_at: null,
        }),
      }),
    );

    // Primary must be untouched
    expect(mockPrisma.merchant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhook_secret: expect.anything(),
        }),
      }),
    );
  });

  it("returns a successful revocation message", async () => {
    const result = await revokeSecondaryWebhookKey("merch_test_01");
    expect(result.message).toMatch(/revoked/i);
    expect(result.data.revoked_at).toBeDefined();
  });

  it("rejects with 400 when no secondary key exists", async () => {
    mockMerchantStore["merch_test_01"].webhook_secret_secondary = null;

    await expect(revokeSecondaryWebhookKey("merch_test_01")).rejects.toMatchObject({
      status: 400,
      code: "WEBHOOK_ROTATION_NOT_IN_PROGRESS",
    });
  });

  it("rejects with 404 if merchant does not exist", async () => {
    await expect(revokeSecondaryWebhookKey("merch_ghost")).rejects.toMatchObject({
      status: 404,
      code: "MERCHANT_NOT_FOUND",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getWebhookKeyStatusService
// ─────────────────────────────────────────────────────────────────────────────

describe("getWebhookKeyStatusService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports rotation_in_progress=false when no secondary key", async () => {
    mockMerchantStore["merch_test_01"] = makeMerchant();
    const result = await getWebhookKeyStatusService("merch_test_01");

    expect(result.data.rotation_in_progress).toBe(false);
    expect(result.data.secondary_key_created_at).toBeNull();
  });

  it("reports rotation_in_progress=true when secondary key exists", async () => {
    const createdAt = new Date("2026-10-19T12:00:00.000Z");
    mockMerchantStore["merch_test_01"] = makeMerchant({
      webhook_secret_secondary: "whsec_active",
      webhook_secret_secondary_created_at: createdAt,
    });

    const result = await getWebhookKeyStatusService("merch_test_01");

    expect(result.data.rotation_in_progress).toBe(true);
    expect(result.data.secondary_key_created_at).toEqual(createdAt);
  });

  it("masks the primary key secret value", async () => {
    mockMerchantStore["merch_test_01"] = makeMerchant({
      webhook_secret: "primary_secret_abc123",
    });
    const result = await getWebhookKeyStatusService("merch_test_01");

    // Should show last 4 chars, rest masked
    expect(result.data.primary_key_hint).not.toBe("primary_secret_abc123");
    expect(result.data.primary_key_hint).toMatch(/\*+/);
    expect(result.data.primary_key_hint).toMatch(/123$/);
  });

  it("does NOT expose raw secret values in the response", async () => {
    mockMerchantStore["merch_test_01"] = makeMerchant({
      webhook_secret: "super_secret_key",
      webhook_secret_secondary: "whsec_another_secret",
      webhook_secret_secondary_created_at: new Date(),
    });
    const result = await getWebhookKeyStatusService("merch_test_01");
    const resultStr = JSON.stringify(result);

    expect(resultStr).not.toContain("super_secret_key");
    expect(resultStr).not.toContain("whsec_another_secret");
  });

  it("rejects with 404 if merchant does not exist", async () => {
    await expect(getWebhookKeyStatusService("merch_ghost")).rejects.toMatchObject({
      status: 404,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full rotation lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("Webhook key rotation lifecycle", () => {
  const merchantId = "merch_lifecycle";

  beforeEach(() => {
    jest.clearAllMocks();
    mockMerchantStore[merchantId] = makeMerchant({
      id: merchantId,
      webhook_secret: "primary_v1",
    });
  });

  it("full rotation: initiate → status → promote → status", async () => {
    // 1. Initiate
    const initResult = await initiateWebhookKeyRotation(merchantId);
    const newSecret = initResult.data.secondary_secret;
    expect(newSecret).toMatch(/^whsec_/);

    // Sync mock state (update mock store with returned data)
    mockMerchantStore[merchantId].webhook_secret_secondary = newSecret;
    mockMerchantStore[merchantId].webhook_secret_secondary_created_at =
      initResult.data.secondary_created_at;

    // 2. Status shows rotation in progress
    const statusDuring = await getWebhookKeyStatusService(merchantId);
    expect(statusDuring.data.rotation_in_progress).toBe(true);

    // 3. Promote
    await promoteSecondaryWebhookKey(merchantId);
    // Sync mock state after promotion
    mockMerchantStore[merchantId].webhook_secret = newSecret;
    mockMerchantStore[merchantId].webhook_secret_secondary = null;
    mockMerchantStore[merchantId].webhook_secret_secondary_created_at = null;

    // 4. Status shows rotation done
    const statusAfter = await getWebhookKeyStatusService(merchantId);
    expect(statusAfter.data.rotation_in_progress).toBe(false);
  });

  it("cancel rotation: initiate → revoke → no secondary remains", async () => {
    const initResult = await initiateWebhookKeyRotation(merchantId);
    mockMerchantStore[merchantId].webhook_secret_secondary = initResult.data.secondary_secret;
    mockMerchantStore[merchantId].webhook_secret_secondary_created_at =
      initResult.data.secondary_created_at;

    await revokeSecondaryWebhookKey(merchantId);
    mockMerchantStore[merchantId].webhook_secret_secondary = null;
    mockMerchantStore[merchantId].webhook_secret_secondary_created_at = null;

    const status = await getWebhookKeyStatusService(merchantId);
    expect(status.data.rotation_in_progress).toBe(false);

    // Primary unchanged
    expect(mockMerchantStore[merchantId].webhook_secret).toBe("primary_v1");
  });

  it("cannot initiate a second rotation while one is in progress", async () => {
    const initResult = await initiateWebhookKeyRotation(merchantId);
    mockMerchantStore[merchantId].webhook_secret_secondary = initResult.data.secondary_secret;

    await expect(initiateWebhookKeyRotation(merchantId)).rejects.toMatchObject({
      status: 409,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dual-signature verification
// ─────────────────────────────────────────────────────────────────────────────

describe("Dual-signature verification during rotation grace window", () => {
  const primarySecret = "primary_signing_secret";
  const secondarySecret = "secondary_signing_secret_new";
  const payload = { event: "payment.confirmed", payment_id: "pay_abc" };
  const body = JSON.stringify(payload);
  const timestamp = "2024-01-15T10:00:00.000Z";

  it("generateWebhookSignature produces consistent signatures for both keys", () => {
    const primarySig = generateWebhookSignature(body, primarySecret, timestamp);
    const secondarySig = generateWebhookSignature(body, secondarySecret, timestamp);

    // Both are valid 64-char hex HMAC-SHA256
    expect(primarySig).toMatch(/^[a-f0-9]{64}$/);
    expect(secondarySig).toMatch(/^[a-f0-9]{64}$/);

    // They differ because the secrets differ
    expect(primarySig).not.toBe(secondarySig);
  });

  it("merchant can verify with primary key when no rotation is in progress", () => {
    const sig = generateWebhookSignature(body, primarySecret, timestamp);

    // Merchant verification (manual HMAC)
    const expected = crypto
      .createHmac("sha256", primarySecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    expect(sig).toBe(expected);
  });

  it("merchant can verify with EITHER key during rotation", () => {
    // Simulate FluxaPay sending dual signatures during grace window
    const primarySig = generateWebhookSignature(body, primarySecret, timestamp);
    const secondarySig = generateWebhookSignature(body, secondarySecret, timestamp);

    // Merchant handler that tries primary first, then secondary
    function merchantVerify(
      incomingBody: string,
      incomingTimestamp: string,
      headerPrimary: string,
      headerSecondary: string | undefined,
      knownPrimary: string,
      knownSecondary?: string,
    ): boolean {
      const expected1 = crypto
        .createHmac("sha256", knownPrimary)
        .update(`${incomingTimestamp}.${incomingBody}`)
        .digest("hex");

      if (crypto.timingSafeEqual(Buffer.from(expected1, "hex"), Buffer.from(headerPrimary, "hex"))) {
        return true;
      }

      if (knownSecondary && headerSecondary) {
        const expected2 = crypto
          .createHmac("sha256", knownSecondary)
          .update(`${incomingTimestamp}.${incomingBody}`)
          .digest("hex");
        return crypto.timingSafeEqual(
          Buffer.from(expected2, "hex"),
          Buffer.from(headerSecondary, "hex"),
        );
      }

      return false;
    }

    // Merchant knows both keys during rotation grace window
    expect(merchantVerify(body, timestamp, primarySig, secondarySig, primarySecret, secondarySecret)).toBe(true);

    // Still works after promotion — merchant uses new primary, no secondary
    expect(merchantVerify(body, timestamp, secondarySig, undefined, secondarySecret)).toBe(true);
  });

  it("verification fails with wrong key", () => {
    const correctSig = generateWebhookSignature(body, primarySecret, timestamp);
    const wrongKey = "completely_wrong_key";

    const wrongSig = crypto
      .createHmac("sha256", wrongKey)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    expect(correctSig).not.toBe(wrongSig);
  });

  it("tampered body invalidates both signatures", () => {
    const originalSig = generateWebhookSignature(body, primarySecret, timestamp);
    const tamperedBody = JSON.stringify({ event: "payment.confirmed", payment_id: "pay_HACKED" });

    const expectedForTampered = crypto
      .createHmac("sha256", primarySecret)
      .update(`${timestamp}.${tamperedBody}`)
      .digest("hex");

    // The signature computed for the tampered body does NOT match the original sig
    expect(originalSig).not.toBe(expectedForTampered);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deliverWebhook — header presence / absence
// ─────────────────────────────────────────────────────────────────────────────

describe("deliverWebhook dual-signing header behavior", () => {
  const capturedHeaders: Record<string, string>[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    capturedHeaders.length = 0;

    (global.fetch as jest.Mock).mockImplementation((_url: string, options: any) => {
      capturedHeaders.push(options.headers as Record<string, string>);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("ok"),
      });
    });
  });

  it("sends only X-FluxaPay-Signature when no secondary secret is given", async () => {
    await deliverWebhook("https://example.com/wh", { event: "test" }, "primary_secret");

    expect(capturedHeaders[0]).toHaveProperty("X-FluxaPay-Signature");
    expect(capturedHeaders[0]).not.toHaveProperty("X-FluxaPay-Signature-Secondary");
  });

  it("sends both signature headers when a secondary secret is provided", async () => {
    await deliverWebhook(
      "https://example.com/wh",
      { event: "test" },
      "primary_secret",
      "secondary_secret",
    );

    expect(capturedHeaders[0]).toHaveProperty("X-FluxaPay-Signature");
    expect(capturedHeaders[0]).toHaveProperty("X-FluxaPay-Signature-Secondary");
  });

  it("primary and secondary signatures differ from each other", async () => {
    await deliverWebhook(
      "https://example.com/wh",
      { event: "test" },
      "primary_secret",
      "secondary_secret",
    );

    const h = capturedHeaders[0];
    expect(h["X-FluxaPay-Signature"]).not.toBe(h["X-FluxaPay-Signature-Secondary"]);
  });

  it("primary signature matches manual HMAC computation", async () => {
    const payloadObj = { event: "payment.confirmed", id: "pay_123" };
    await deliverWebhook(
      "https://example.com/wh",
      payloadObj,
      "primary_secret",
    );

    const h = capturedHeaders[0];
    const ts: string = h["X-FluxaPay-Timestamp"];
    const body = JSON.stringify(payloadObj);

    const expected = crypto
      .createHmac("sha256", "primary_secret")
      .update(`${ts}.${body}`)
      .digest("hex");

    expect(h["X-FluxaPay-Signature"]).toBe(expected);
  });

  it("secondary signature matches manual HMAC computation", async () => {
    const payloadObj = { event: "payment.confirmed", id: "pay_456" };
    await deliverWebhook(
      "https://example.com/wh",
      payloadObj,
      "primary_secret",
      "secondary_secret",
    );

    const h = capturedHeaders[0];
    const ts: string = h["X-FluxaPay-Timestamp"];
    const body = JSON.stringify(payloadObj);

    const expected = crypto
      .createHmac("sha256", "secondary_secret")
      .update(`${ts}.${body}`)
      .digest("hex");

    expect(h["X-FluxaPay-Signature-Secondary"]).toBe(expected);
  });

  it("does not send secondary header when null is explicitly passed", async () => {
    await deliverWebhook("https://example.com/wh", { event: "test" }, "primary_secret", null);

    expect(capturedHeaders[0]).not.toHaveProperty("X-FluxaPay-Signature-Secondary");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WebhookDispatcher.sendPaymentWebhook — dual-signing
// ─────────────────────────────────────────────────────────────────────────────

describe("WebhookDispatcher.sendPaymentWebhook dual-signing", () => {
  const capturedHeaders: Record<string, string>[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    capturedHeaders.length = 0;

    (global.fetch as jest.Mock).mockImplementation((_url: string, options: any) => {
      capturedHeaders.push(options.headers as Record<string, string>);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("ok"),
      });
    });

    // Mock payment.update
    (mockPrisma as any).payment = {
      update: jest.fn().mockResolvedValue({}),
    };
  });

  const basePayment: any = {
    id: "pay_001",
    amount: "100.00",
    currency: "USD",
    status: "confirmed",
    transaction_hash: "0xabc",
  };

  it("sends only X-FluxaPay-Signature when merchant has no secondary secret", async () => {
    const merchant: any = makeMerchant({
      webhook_secret_secondary: null,
    });

    const dispatcher = new WebhookDispatcher(mockPrisma as any);
    await dispatcher.sendPaymentWebhook(basePayment, merchant, "payment_confirmed");

    expect(capturedHeaders[0]).toHaveProperty("X-FluxaPay-Signature");
    expect(capturedHeaders[0]).not.toHaveProperty("X-FluxaPay-Signature-Secondary");
  });

  it("sends both signature headers when merchant has a secondary secret", async () => {
    const merchant: any = makeMerchant({
      webhook_secret_secondary: "secondary_active_secret",
    });

    const dispatcher = new WebhookDispatcher(mockPrisma as any);
    await dispatcher.sendPaymentWebhook(basePayment, merchant, "payment_confirmed");

    expect(capturedHeaders[0]).toHaveProperty("X-FluxaPay-Signature");
    expect(capturedHeaders[0]).toHaveProperty("X-FluxaPay-Signature-Secondary");
    expect(capturedHeaders[0]["X-FluxaPay-Signature"]).not.toBe(
      capturedHeaders[0]["X-FluxaPay-Signature-Secondary"],
    );
  });
});
