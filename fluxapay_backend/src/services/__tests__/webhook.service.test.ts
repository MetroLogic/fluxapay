import { createAndDeliverWebhook, deliverWebhook, generateWebhookSignature } from "../webhook.service";
import { PrismaClient } from "../../generated/client/client";

// Define mock functions inside the factory to avoid jest-hoisting TDZ issues with const
jest.mock("../../generated/client/client", () => {
  const findUnique = jest.fn();
  const webhookCreate = jest.fn();
  const webhookUpdate = jest.fn();
  const webhookFindFirst = jest.fn();
  const webhookFindMany = jest.fn();
  const webhookFindUnique = jest.fn();
  const webhookCount = jest.fn();
  const retryAttemptCreate = jest.fn();
  return {
    PrismaClient: jest.fn(() => ({
      merchant: { findUnique },
      webhookLog: {
        create: webhookCreate,
        update: webhookUpdate,
        findFirst: webhookFindFirst,
        findMany: webhookFindMany,
        findUnique: webhookFindUnique,
        count: webhookCount,
      },
      webhookRetryAttempt: { create: retryAttemptCreate },
    })),
  };
});

// Access mock fns from the PrismaClient instance created during webhook.service module load
const MockedPrismaClient = PrismaClient as jest.MockedClass<typeof PrismaClient>;
const mockPrismaInstance = MockedPrismaClient.mock.results[0]!.value;
const mockMerchant = {
  findUnique: mockPrismaInstance.merchant.findUnique as jest.Mock,
  webhookLog: mockPrismaInstance.webhookLog as {
    create: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
  },
};

// We will override global.fetch in tests
const originalFetch = global.fetch;

describe("webhook.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("should compute signature using merchant-specific secret and include timestamp header", async () => {
    const merchantId = "m1";
    const webhookUrl = "https://example.com/hook";
    const merchantSecret = "merchant-secret-abc";

    mockMerchant.findUnique.mockResolvedValueOnce({
      id: merchantId,
      webhook_url: webhookUrl,
      webhook_secret: merchantSecret,
    });
    mockMerchant.webhookLog.findUnique.mockResolvedValueOnce(null);
    mockMerchant.webhookLog.create.mockResolvedValue({ id: "log1" });
    mockMerchant.webhookLog.update.mockResolvedValue({});

    let capturedHeaders: any = {};
    global.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("OK") });
    });

    const payload = { foo: "bar" };
    await createAndDeliverWebhook(merchantId, "payment_completed", payload);

    expect(global.fetch).toHaveBeenCalledWith(webhookUrl, expect.any(Object));
    expect(capturedHeaders["X-FluxaPay-Timestamp"]).toBeDefined();

    // The sent body includes event_id prepended; reconstruct it to verify signature
    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const ts = capturedHeaders["X-FluxaPay-Timestamp"] as string;
    const expectedSig = generateWebhookSignature(sentBody, merchantSecret, ts);
    expect(capturedHeaders["X-FluxaPay-Signature"]).toBe(expectedSig);

    // ensure we are not accidentally using the env variable
    process.env.WEBHOOK_SECRET = "global-secret";
    const wrongSig = generateWebhookSignature(sentBody, process.env.WEBHOOK_SECRET!, ts);
    expect(capturedHeaders["X-FluxaPay-Signature"]).not.toBe(wrongSig);
  });

  it("deliverWebhook helper should allow external usage and sign with provided secret", async () => {
    const payload = { hello: "world" };
    const secret = "abc123";
    let headers: any = {};

    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });
    global.fetch = fakeFetch as any;

    await deliverWebhook("https://example.com", payload, secret);
    const opts = fakeFetch.mock.calls[0][1];
    expect(opts.headers["X-FluxaPay-Timestamp"]).toBeDefined();
    const ts = opts.headers["X-FluxaPay-Timestamp"];
    const sig = generateWebhookSignature(payload, secret, ts);
    expect(opts.headers["X-FluxaPay-Signature"]).toBe(sig);
  });

  it("should embed event_id in the outgoing payload", async () => {
    const merchantId = "m2";
    const webhookUrl = "https://example.com/hook";
    const merchantSecret = "secret-xyz";
    const stableEventId = "evt_stable-uuid-1234";

    mockMerchant.findUnique.mockResolvedValueOnce({
      id: merchantId,
      webhook_url: webhookUrl,
      webhook_secret: merchantSecret,
    });
    mockMerchant.webhookLog.findUnique.mockResolvedValueOnce(null);
    mockMerchant.webhookLog.create.mockResolvedValue({ id: "log2" });
    mockMerchant.webhookLog.update.mockResolvedValue({});

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    await createAndDeliverWebhook(merchantId, "payment_completed", { amount: 50 }, undefined, undefined, stableEventId);

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.event_id).toBe(stableEventId);
  });

  it("should skip delivery and return existing log when event_id already delivered", async () => {
    const merchantId = "m3";
    const merchantSecret = "secret-dedup";
    const stableEventId = "evt_already-delivered";
    const existingLog = { id: "log-existing", status: "delivered", event_id: stableEventId };

    mockMerchant.findUnique.mockResolvedValueOnce({
      id: merchantId,
      webhook_url: "https://example.com/hook",
      webhook_secret: merchantSecret,
    });
    mockMerchant.webhookLog.findUnique.mockResolvedValueOnce(existingLog);

    global.fetch = jest.fn();

    const result = await createAndDeliverWebhook(merchantId, "payment_completed", { amount: 50 }, undefined, undefined, stableEventId);

    // fetch must NOT have been called — delivery was skipped
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockMerchant.webhookLog.create).not.toHaveBeenCalled();
    expect(result).toBe(existingLog);
  });

  it("should proceed with delivery when event_id exists but was not yet delivered", async () => {
    const merchantId = "m4";
    const merchantSecret = "secret-retry";
    const stableEventId = "evt_pending-retry";

    mockMerchant.findUnique.mockResolvedValueOnce({
      id: merchantId,
      webhook_url: "https://example.com/hook",
      webhook_secret: merchantSecret,
    });
    // existing log is in "retrying" state — should re-attempt delivery
    mockMerchant.webhookLog.findUnique.mockResolvedValueOnce({ id: "log-retry", status: "retrying", event_id: stableEventId });
    mockMerchant.webhookLog.create.mockResolvedValue({ id: "log-new" });
    mockMerchant.webhookLog.update.mockResolvedValue({});

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    await createAndDeliverWebhook(merchantId, "payment_completed", { amount: 50 }, undefined, undefined, stableEventId);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
