import { compareKeys } from "../../helpers/crypto.helper";

// Mock Prisma
const mockMerchant = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockApiKey = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockBankAccount = {
  create: jest.fn(),
};

const mockTransaction = jest.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) =>
  callback(mockTx),
);

const mockTx = {
  merchant: mockMerchant,
  apiKey: mockApiKey,
  bankAccount: mockBankAccount,
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    merchant: mockMerchant,
    apiKey: mockApiKey,
    $transaction: mockTransaction,
  })),
}));

jest.mock("../otp.service", () => ({
  createOtp: jest.fn().mockResolvedValue("123456"),
  verifyOtpService: jest.fn(),
}));

jest.mock("../email.service", () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../merchantRegistry.service", () => ({
  merchantRegistryService: {
    register_merchant: jest.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks
import {
  signupMerchantService,
  getMerchantUserService,
  regenerateApiKeyService,
  rotateApiKeyService,
} from "../merchant.service";

describe("merchant.service API key handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("signupMerchantService", () => {
    const signupData = {
      business_name: "Test Co",
      email: "test@example.com",
      phone_number: "+1234567890",
      country: "US",
      settlement_currency: "USD",
      password: "strongP@ss1",
    };

    it("stores hashed key + last4, returns raw key once", async () => {
      mockMerchant.findFirst.mockResolvedValue(null);
      mockMerchant.create.mockResolvedValue({ id: "m1" });

      const result = await signupMerchantService(signupData);

      expect(mockTransaction).toHaveBeenCalled();
      expect(mockMerchant.create).toHaveBeenCalled();
      const createData = mockMerchant.create.mock.calls[0][0].data;
      expect(createData.api_key_hashed).toBeDefined();
      expect(createData.api_key_last_four).toHaveLength(4);
      expect(createData).not.toHaveProperty("api_key");
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
    });
  });

  describe("getMerchantUserService", () => {
    it("returns api_key_masked, no raw fields", async () => {
      const mockMerchantData = {
        id: "m1",
        business_name: "Test Co",
        email: "test@example.com",
        api_key_last_four: "abcd",
        status: "active",
      };
      mockMerchant.findUnique.mockResolvedValue(mockMerchantData);

      const result = await getMerchantUserService({ merchantId: "m1" });

      expect(result.merchant.api_key_masked).toBe("sk_live_****abcd");
      expect(result.merchant.api_key_last_four).toBe("abcd");
      expect(result.merchant).not.toHaveProperty("api_key_hashed");
    });

    it("returns null mask if no key", async () => {
      const mockMerchantData = {
        id: "m1",
        business_name: "Test Co",
        email: "test@example.com",
        api_key_last_four: null,
      };
      mockMerchant.findUnique.mockResolvedValue(mockMerchantData);

      const result = await getMerchantUserService({ merchantId: "m1" });
      expect(result.merchant.api_key_masked).toBeNull();
    });
  });

  describe("regenerateApiKeyService & rotateApiKeyService", () => {
    it("generates new key, stores hash+last4", async () => {
      const startedAt = Date.now();
      mockMerchant.findUnique.mockResolvedValue({
        api_key_hashed: "$2b$old-hash",
        api_key_last_four: "abcd",
      });
      mockApiKey.findUnique.mockResolvedValue(null);
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await regenerateApiKeyService({ merchantId: "m1" });

      expect(mockMerchant.update).toHaveBeenCalled();
      const updateData = mockMerchant.update.mock.calls[0][0].data;
      expect(updateData.api_key_hashed).toBeDefined();
      expect(updateData.api_key_last_four).toHaveLength(4);
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
      expect(mockApiKey.create).toHaveBeenCalledTimes(2);
      const [oldKey, newKey] = mockApiKey.create.mock.calls.map(([call]) => call.data);
      expect(oldKey.key_hash).toBe("$2b$old-hash");
      expect(oldKey.expires_at.getTime()).toBeGreaterThanOrEqual(startedAt + 24 * 60 * 60 * 1000);
      expect(newKey.key_hash).toBe(updateData.api_key_hashed);
      expect(newKey.expires_at).toBeUndefined();
      expect(result.gracePeriodHours).toBe(24);
    });

    it("rotate works the same as regenerate", async () => {
      mockMerchant.findUnique.mockResolvedValue({
        api_key_hashed: "$2b$old-hash",
        api_key_last_four: "abcd",
      });
      mockApiKey.findUnique.mockResolvedValue(null);
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await rotateApiKeyService({ merchantId: "m1", gracePeriodHours: 2 });

      expect(mockMerchant.update).toHaveBeenCalled();
      const updateData = mockMerchant.update.mock.calls[0][0].data;
      expect(updateData.api_key_hashed).toBeDefined();
      expect(updateData.api_key_last_four).toHaveLength(4);
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
      expect(result.gracePeriodHours).toBe(2);
      const [oldKey] = mockApiKey.create.mock.calls.map(([call]) => call.data);
      expect(oldKey.expires_at.getTime()).toBeGreaterThan(Date.now() + 1.9 * 60 * 60 * 1000);
    });

    it("regenerate supports test-mode keys (sk_test_)", async () => {
      mockMerchant.findUnique.mockResolvedValue(null);
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await regenerateApiKeyService({ merchantId: "m1", mode: "test" });

      expect(mockMerchant.update).toHaveBeenCalled();
      const updateData = mockMerchant.update.mock.calls[0][0].data;
      expect(updateData.api_key_hashed).toBeDefined();
      expect(updateData.api_key_last_four).toHaveLength(4);
      expect(result.apiKey).toMatch(/^sk_test_[a-f0-9]{32}$/);
    });
  });
});
