import { compareKeys } from "../../helpers/crypto.helper";

// Mock functions must live inside the factory to survive jest.mock hoisting
const mockMerchant = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({ merchant: mockMerchant })),
}));

jest.mock("../otp.service", () => ({
  createOtp: jest.fn().mockResolvedValue("123456"),
  verifyOtp: jest.fn(),
}));

jest.mock("../email.service", () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../merchantRegistry.service", () => ({
  merchantRegistryService: {
    register_merchant: jest.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks are registered
import {
  signupMerchantService,
  getMerchantUserService,
  regenerateApiKeyService,
  rotateApiKeyService,
} from "../merchant.service";

describe("merchant.service — API key hashing", () => {
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

    it("should store api_key_hashed and api_key_last_four, not raw api_key", async () => {
      mockMerchant.findFirst.mockResolvedValue(null);
      mockMerchant.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "m1", ...data }));

      const result = await signupMerchantService(signupData);

      const createCall = mockMerchant.create.mock.calls[0][0].data;

      // Must NOT contain raw api_key
      expect(createCall).not.toHaveProperty("api_key");

      // Must contain hashed fields
      expect(createCall).toHaveProperty("api_key_hashed");
      expect(createCall).toHaveProperty("api_key_last_four");
      expect(typeof createCall.api_key_hashed).toBe("string");
      expect(createCall.api_key_last_four).toHaveLength(4);

      // The response should include the raw key exactly once
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
    });

    it("should return a raw key that matches the stored hash", async () => {
      mockMerchant.findFirst.mockResolvedValue(null);
      mockMerchant.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "m1", ...data }));

      const result = await signupMerchantService(signupData);
      const storedHash = mockMerchant.create.mock.calls[0][0].data.api_key_hashed;

      const matches = await compareKeys(result.apiKey, storedHash);
      expect(matches).toBe(true);
    });
  });

  describe("getMerchantUserService", () => {
    it("should return api_key_masked and never a raw key", async () => {
      mockMerchant.findUnique.mockResolvedValue({
        id: "m1",
        business_name: "Test Co",
        email: "test@example.com",
        phone_number: "+1234567890",
        country: "US",
        settlement_currency: "USD",
        status: "active",
        api_key_last_four: "abcd",
        webhook_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        settlement_schedule: "daily",
        settlement_day: null,
      });

      const result = await getMerchantUserService({ merchantId: "m1" });

      // Should include masked key
      expect(result.merchant.api_key_masked).toBe("sk_live_****abcd");

      // Should NOT include raw key or last_four directly
      expect(result.merchant).not.toHaveProperty("api_key");
      expect(result.merchant).not.toHaveProperty("api_key_last_four");
      expect(result.merchant).not.toHaveProperty("api_key_hashed");
    });

    it("should return null mask when no key exists", async () => {
      mockMerchant.findUnique.mockResolvedValue({
        id: "m1",
        business_name: "Test Co",
        email: "test@example.com",
        phone_number: "+1234567890",
        country: "US",
        settlement_currency: "USD",
        status: "active",
        api_key_last_four: null,
        webhook_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        settlement_schedule: "daily",
        settlement_day: null,
      });

      const result = await getMerchantUserService({ merchantId: "m1" });
      expect(result.merchant.api_key_masked).toBeNull();
    });
  });

  describe("regenerateApiKeyService", () => {
    it("should store api_key_hashed and api_key_last_four", async () => {
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await regenerateApiKeyService({ merchantId: "m1" });

      const updateData = mockMerchant.update.mock.calls[0][0].data;
      expect(updateData).toHaveProperty("api_key_hashed");
      expect(updateData).toHaveProperty("api_key_last_four");
      expect(updateData).not.toHaveProperty("api_key");
      expect(updateData.api_key_last_four).toHaveLength(4);

      // Raw key returned once
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
    });

    it("should return a raw key that matches the stored hash", async () => {
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await regenerateApiKeyService({ merchantId: "m1" });
      const storedHash = mockMerchant.update.mock.calls[0][0].data.api_key_hashed;

      const matches = await compareKeys(result.apiKey, storedHash);
      expect(matches).toBe(true);
    });
  });

  describe("rotateApiKeyService", () => {
    it("should store hashed key and last four, same as regenerate", async () => {
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await rotateApiKeyService({ merchantId: "m1" });

      const updateData = mockMerchant.update.mock.calls[0][0].data;
      expect(updateData).toHaveProperty("api_key_hashed");
      expect(updateData).toHaveProperty("api_key_last_four");
      expect(updateData).not.toHaveProperty("api_key");

      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);

      const matches = await compareKeys(result.apiKey, updateData.api_key_hashed);
      expect(matches).toBe(true);
    });
  });
});
