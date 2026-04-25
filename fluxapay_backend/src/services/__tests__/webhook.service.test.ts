import { WebhookDispatcher, createAndDeliverWebhook, deliverWebhook, generateWebhookSignature, getDeadLetterQueueService, requeueWebhookService } from "../webhook.service";
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
  const paymentUpdate = jest.fn();
  return {
    PrismaClient: jest.fn(() => ({
      merchant: { findUnique },
      payment: { update: paymentUpdate },
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
  payment: {
    update: mockPrismaInstance.payment.update as jest.Mock,
  },
  webhookLog: mockPrismaInstance.webhookLog as {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
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

describe("WebhookDispatcher.sendPaymentWebhook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("should sign with merchant.webhook_secret and include X-FluxaPay-Signature + X-FluxaPay-Timestamp headers", async () => {
    const merchantId = "disp_m1";
    const webhookUrl = "https://example.com/hook";
    const merchantSecret = "merchant-dispatcher-secret";

    let capturedHeaders: any = {};
    global.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("OK") });
    });

    const dispatcher = new WebhookDispatcher(new PrismaClient());

    const payment = {
      id: "pay_001",
      amount: 100,
      currency: "USDC",
      transaction_hash: "tx_hash_123",
    } as any;

    const merchant = {
      id: merchantId,
      webhook_url: webhookUrl,
      webhook_secret: merchantSecret,
    } as any;

    await dispatcher.sendPaymentWebhook(payment, merchant);

    expect(global.fetch).toHaveBeenCalledWith(webhookUrl, expect.any(Object));
    expect(capturedHeaders["X-FluxaPay-Timestamp"]).toBeDefined();
    expect(capturedHeaders["X-FluxaPay-Signature"]).toBeDefined();
    expect(capturedHeaders["x-webhook-signature"]).toBeUndefined();

    // Verify signature was generated with merchant-specific secret
    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const ts = capturedHeaders["X-FluxaPay-Timestamp"] as string;
    const expectedSig = generateWebhookSignature(sentBody, merchantSecret, ts);
    expect(capturedHeaders["X-FluxaPay-Signature"]).toBe(expectedSig);

    // Ensure payment.update was called in finally block
    expect(mockMerchant.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_001" },
      data: { webhook_status: "SUCCESS", webhook_retries: { increment: 1 } },
    });
  });

  it("should skip delivery when merchant has no webhook_secret", async () => {
    global.fetch = jest.fn();

    const dispatcher = new WebhookDispatcher(new PrismaClient());
    const payment = { id: "pay_002" } as any;
    const merchant = { id: "m_no_secret", webhook_url: "https://example.com/hook", webhook_secret: null } as any;

    await dispatcher.sendPaymentWebhook(payment, merchant);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockMerchant.payment.update).not.toHaveBeenCalled();
  });

  it("should skip delivery when merchant has no webhook_url", async () => {
    global.fetch = jest.fn();

    const dispatcher = new WebhookDispatcher(new PrismaClient());
    const payment = { id: "pay_003" } as any;
    const merchant = { id: "m_no_url", webhook_url: null, webhook_secret: "secret" } as any;

    await dispatcher.sendPaymentWebhook(payment, merchant);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockMerchant.payment.update).not.toHaveBeenCalled();
  });
});

describe("DLQ services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("getDeadLetterQueueService should query for failed webhooks with failed_at not null", async () => {
    const mockLogs = [
      {
        id: "log_dlq_1",
        merchantId: "m1",
        merchant: { business_name: "Merchant A", email: "a@example.com" },
        event_type: "payment_completed",
        endpoint_url: "https://example.com/hook",
        http_status: 500,
        status: "failed",
        event_id: "evt_1",
        payment_id: "pay_1",
        retry_count: 5,
        max_retries: 5,
        failure_reason: "Connection timeout",
        failed_at: new Date("2026-04-24T10:00:00Z"),
        request_payload: { event: "payment_completed" },
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    mockMerchant.webhookLog.findMany.mockResolvedValueOnce(mockLogs);
    mockMerchant.webhookLog.count.mockResolvedValueOnce(1);

    const result = await getDeadLetterQueueService({ page: 1, limit: 10 });

    expect(mockMerchant.webhookLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "failed",
          failed_at: { not: null },
        }),
        orderBy: { failed_at: "desc" },
        include: expect.objectContaining({
          merchant: expect.any(Object),
        }),
      })
    );

    expect(result.data.logs).toHaveLength(1);
    expect(result.data.logs[0].failure_reason).toBe("Connection timeout");
    expect(result.data.pagination.total).toBe(1);
  });

  it("getDeadLetterQueueService should filter by merchant_id and date range", async () => {
    mockMerchant.webhookLog.findMany.mockResolvedValueOnce([]);
    mockMerchant.webhookLog.count.mockResolvedValueOnce(0);

    await getDeadLetterQueueService({
      page: 1,
      limit: 10,
      merchant_id: "m_special",
      date_from: "2026-04-01T00:00:00Z",
      date_to: "2026-04-30T23:59:59Z",
    });

    expect(mockMerchant.webhookLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "failed",
          failed_at: { not: null, gte: new Date("2026-04-01T00:00:00Z"), lte: new Date("2026-04-30T23:59:59Z") },
          merchantId: "m_special",
        }),
      })
    );
  });

  it("requeueWebhookService should reset a failed webhook to pending with incremented max_retries", async () => {
    const log = {
      id: "log_dlq_2",
      status: "failed",
      retry_count: 5,
      max_retries: 5,
    };

    mockMerchant.webhookLog.findUnique.mockResolvedValueOnce(log);
    mockMerchant.webhookLog.update.mockResolvedValueOnce({
      ...log,
      status: "pending",
      retry_count: 0,
      max_retries: 8,
      failed_at: null,
      failure_reason: null,
      next_retry_at: new Date(),
    });

    const result = await requeueWebhookService({ log_id: "log_dlq_2" });

    expect(mockMerchant.webhookLog.findUnique).toHaveBeenCalledWith({ where: { id: "log_dlq_2" } });
    expect(mockMerchant.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log_dlq_2" },
        data: expect.objectContaining({
          status: "pending",
          retry_count: 0,
          max_retries: 8,
          failed_at: null,
          failure_reason: null,
        }),
      })
    );

    expect(result.data.status).toBe("pending");
    expect(result.data.retry_count).toBe(0);
    expect(result.data.max_retries).toBe(8);
  });

  it("requeueWebhookService should reject non-failed webhooks", async () => {
    mockMerchant.webhookLog.findUnique.mockResolvedValueOnce({
      id: "log_ok",
      status: "delivered",
    });

    await expect(requeueWebhookService({ log_id: "log_ok" })).rejects.toEqual(
      expect.objectContaining({ status: 400, message: "Only failed webhooks can be requeued" })
    );
  });

  it("requeueWebhookService should 404 for missing log", async () => {
    mockMerchant.webhookLog.findUnique.mockResolvedValueOnce(null);

    await expect(requeueWebhookService({ log_id: "missing" })).rejects.toEqual(
      expect.objectContaining({ status: 404, message: "Webhook log not found" })
    );
  });
});
