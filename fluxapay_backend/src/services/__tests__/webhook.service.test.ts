import { createAndDeliverWebhook, deliverWebhook, generateWebhookSignature } from "../webhook.service";

// mock prisma client
const mockMerchant = {
  findUnique: jest.fn(),
  webhookLog: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    merchant: mockMerchant,
    webhookLog: mockMerchant.webhookLog,
  })),
}));

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

    // two lookups happen in createAndDeliverWebhook; return same merchant both times
    mockMerchant.findUnique.mockResolvedValueOnce({
      id: merchantId,
      webhook_url: webhookUrl,
      webhook_secret: merchantSecret,
    });
    mockMerchant.findUnique.mockResolvedValueOnce({ id: merchantId, webhook_secret: merchantSecret });
    mockMerchant.webhookLog.create.mockResolvedValue({ id: "log1" });
    mockMerchant.webhookLog.update.mockResolvedValue({});

    let capturedHeaders: any = {};
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("OK") });
    });

    const payload = { foo: "bar" };
    await createAndDeliverWebhook(merchantId, "payment_completed", payload);

    expect(global.fetch).toHaveBeenCalledWith(webhookUrl, expect.any(Object));
    expect(capturedHeaders["X-FluxaPay-Timestamp"]).toBeDefined();

    // calculate expected signature using the timestamp that was sent
    const ts = capturedHeaders["X-FluxaPay-Timestamp"] as string;
    const expectedSig = generateWebhookSignature(payload, merchantSecret, ts);
    expect(capturedHeaders["X-FluxaPay-Signature"]).toBe(expectedSig);

    // ensure we are not accidentally using the env variable
    process.env.WEBHOOK_SECRET = "global-secret";
    const wrongSig = generateWebhookSignature(payload, process.env.WEBHOOK_SECRET!, ts);
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
});
