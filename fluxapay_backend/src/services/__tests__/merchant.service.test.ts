import { compareKeys } from "../../helpers/crypto.helper";

// Mock Prisma
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
      expect(result.merchant).not.toHaveProperty("api_key_hashed");
      expect(result.merchant).not.toHaveProperty("api_key_last_four");
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
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await regenerateApiKeyService({ merchantId: "m1" });

      expect(mockMerchant.update).toHaveBeenCalled();
      const updateData = mockMerchant.update.mock.calls[0][0].data;
      expect(updateData.api_key_hashed).toBeDefined();
      expect(updateData.api_key_last_four).toHaveLength(4);
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
    });

    it("rotate works the same as regenerate", async () => {
      mockMerchant.update.mockResolvedValue({ id: "m1" });

      const result = await rotateApiKeyService({ merchantId: "m1" });

      expect(mockMerchant.update).toHaveBeenCalled();
      const updateData = mockMerchant.update.mock.calls[0][0].data;
      expect(updateData.api_key_hashed).toBeDefined();
      expect(updateData.api_key_last_four).toHaveLength(4);
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
    });
  });
});
