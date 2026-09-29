/**
 * passwordReset.service.test.ts
 *
 * Unit tests for #1064: a password reset token must be single-use. A stolen
 * token replayed after a successful reset must be rejected with 400, not
 * silently accepted again.
 */

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock("../../config/prisma", () => ({
  prisma: {
    merchant: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}));

const mockRedisSet = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisGetDel = jest.fn();
jest.mock("../../middleware/redisIdempotency.middleware", () => ({
  redisClient: {
    set: (...args: any[]) => mockRedisSet(...args),
    get: (...args: any[]) => mockRedisGet(...args),
    getdel: (...args: any[]) => mockRedisGetDel(...args),
  },
}));

jest.mock("../email.service", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockInvalidateAllMerchantTokens = jest.fn().mockResolvedValue(undefined);
jest.mock("../auth.service", () => ({
  invalidateAllMerchantTokens: (...args: any[]) => mockInvalidateAllMerchantTokens(...args),
}));

import {
  requestPasswordResetService,
  validatePasswordResetTokenService,
  resetPasswordService,
} from "../passwordReset.service";

describe("passwordReset.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requestPasswordResetService", () => {
    it("stores a hashed token in Redis and emails a reset link when the merchant exists", async () => {
      mockFindUnique.mockResolvedValue({ id: "merchant_1", email: "user@example.com" });
      mockRedisSet.mockResolvedValue("OK");

      const result = await requestPasswordResetService({ email: "user@example.com" });

      expect(result.message).toMatch(/if an account/i);
      expect(mockRedisSet).toHaveBeenCalledTimes(1);
      const [key, value, , ttl] = mockRedisSet.mock.calls[0];
      expect(key).toMatch(/^password_reset:/);
      expect(value).toBe("merchant_1");
      expect(ttl).toBe(1800);
    });

    it("returns the same generic message when the merchant does not exist (no enumeration)", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await requestPasswordResetService({ email: "nobody@example.com" });

      expect(result.message).toMatch(/if an account/i);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });

  describe("validatePasswordResetTokenService", () => {
    it("reports valid when the token exists in Redis", async () => {
      mockRedisGet.mockResolvedValue("merchant_1");
      const result = await validatePasswordResetTokenService({ token: "some-token" });
      expect(result.valid).toBe(true);
    });

    it("reports invalid when the token is not found", async () => {
      mockRedisGet.mockResolvedValue(null);
      const result = await validatePasswordResetTokenService({ token: "some-token" });
      expect(result.valid).toBe(false);
    });
  });

  describe("resetPasswordService — single-use enforcement (#1064)", () => {
    it("resets the password and invalidates the token on first use", async () => {
      mockRedisGetDel.mockResolvedValue("merchant_1");
      mockUpdate.mockResolvedValue({ id: "merchant_1" });

      const result = await resetPasswordService({ token: "valid-token", new_password: "NewPassw0rd!" });

      expect(result.message).toMatch(/successful/i);
      expect(mockRedisGetDel).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "merchant_1" } }),
      );
      expect(mockInvalidateAllMerchantTokens).toHaveBeenCalledWith("merchant_1");
    });

    it("rejects reuse of the same token with a 400 after it was already consumed", async () => {
      // GETDEL is atomic: the second call finds nothing because the first
      // call already deleted the key.
      mockRedisGetDel.mockResolvedValueOnce("merchant_1").mockResolvedValueOnce(null);
      mockUpdate.mockResolvedValue({ id: "merchant_1" });

      const first = await resetPasswordService({ token: "one-time-token", new_password: "FirstPassw0rd!" });
      expect(first.message).toMatch(/successful/i);

      await expect(
        resetPasswordService({ token: "one-time-token", new_password: "SecondPassw0rd!" }),
      ).rejects.toMatchObject({ status: 400 });

      // Only the first call should have updated the password.
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it("rejects an unknown/expired token with a 400 without touching the database", async () => {
      mockRedisGetDel.mockResolvedValue(null);

      await expect(
        resetPasswordService({ token: "bogus-token", new_password: "Whatever123!" }),
      ).rejects.toMatchObject({ status: 400 });

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
