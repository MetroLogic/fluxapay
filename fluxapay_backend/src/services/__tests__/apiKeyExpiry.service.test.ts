jest.mock("../../config/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    merchant: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("../email.service", () => ({
  sendApiKeyExpirationWarningEmail: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../config/prisma";
import { apiKeyService } from "../apiKey.service";
import { sendApiKeyExpirationWarningEmail } from "../email.service";

describe("apiKeyService expiry reminder job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends a renewal email when a key expires within 7 days", async () => {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    (prisma as any).apiKey.findMany.mockResolvedValue([
      {
        id: "key_123",
        name: "Production",
        merchantId: "merchant_1",
        environment: "live",
        status: "active",
        expires_at: expiresAt,
        key_last_four: "abcd",
        merchant: {
          email: "merchant@example.com",
          business_name: "Example Inc",
        },
      },
    ]);

    const result = await apiKeyService.runApiKeyExpiryWarningJob();

    expect(result.notified).toBe(1);
    expect(sendApiKeyExpirationWarningEmail).toHaveBeenCalledWith(
      "merchant@example.com",
      "Example Inc",
      expect.objectContaining({
        key_id: "key_123",
        expires_at: expiresAt.toISOString(),
        days_remaining: expect.any(Number),
        severity: "warning",
      }),
    );
  });
});
