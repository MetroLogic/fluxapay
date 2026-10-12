import {
  loginWithEmailPassword,
  refreshAccessToken,
  invalidateAllMerchantTokens,
} from "../auth.service";
import { PrismaClient } from "../../generated/client/client";
import { ErrorCode } from "../../types/errors";
import bcrypt from "bcrypt";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/fluxapay_test?schema=public";
process.env.JWT_SECRET = process.env.JWT_SECRET || "ci-test-jwt-secret-key";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const prisma = new PrismaClient();

function uniquePhone(): string {
  return `+188801${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

describe("Auth Service — Refresh Token Rotation & Reuse Detection", () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const merchantFilter = {
      email: { contains: "test-rotation-" },
    };

    const merchants = await prisma.merchant.findMany({
      where: merchantFilter,
      select: { id: true },
    });
    const merchantIds = merchants.map((m) => m.id);

    if (merchantIds.length > 0) {
      await prisma.refreshToken.deleteMany({ where: { merchantId: { in: merchantIds } } });
    }

    await prisma.merchant.deleteMany({ where: merchantFilter });
  });

  describe("refreshAccessToken", () => {
    it("should rotate refresh token on successful refresh", async () => {
      // Create test merchant
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Rotation Test Merchant",
          email: `test-rotation-${Date.now()}@example.com`,
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Login to get initial tokens
      const loginResult = await loginWithEmailPassword({
        email: merchant.email,
        password: "TestPassword123!",
        ipAddress: "127.0.0.1",
        userAgent: "test-client",
      });

      const oldRefreshToken = loginResult.refresh_token;
      const initialAccessToken = loginResult.access_token;

      // Refresh the token
      const refreshResult = await refreshAccessToken({
        refreshToken: oldRefreshToken,
        ipAddress: "127.0.0.1",
        userAgent: "test-client",
      });

      expect(refreshResult.access_token).toBeDefined();
      expect(refreshResult.refresh_token).toBeDefined();
      expect(refreshResult.refresh_token).not.toBe(oldRefreshToken);

      // Old token should be revoked
      const oldTokenRecord = await prisma.refreshToken.findMany({
        where: { merchantId: merchant.id },
      });
      expect(oldTokenRecord.some((t) => t.is_revoked)).toBe(true);

      // New token should be active
      expect(oldTokenRecord.some((t) => !t.is_revoked)).toBe(true);
    });

    it("should reject already-revoked refresh token", async () => {
      // Create test merchant
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Reuse Test Merchant",
          email: `test-rotation-reuse-${Date.now()}@example.com`,
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Login to get initial tokens
      const loginResult = await loginWithEmailPassword({
        email: merchant.email,
        password: "TestPassword123!",
        ipAddress: "127.0.0.1",
        userAgent: "test-client",
      });

      const oldRefreshToken = loginResult.refresh_token;

      // First refresh succeeds
      await refreshAccessToken({
        refreshToken: oldRefreshToken,
        ipAddress: "127.0.0.1",
        userAgent: "test-client",
      });

      // Try to reuse the old token (should fail)
      try {
        await refreshAccessToken({
          refreshToken: oldRefreshToken,
          ipAddress: "127.0.0.1",
          userAgent: "test-client-malicious",
        });
        fail("Should have thrown an error for token reuse");
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });

    it("should invalidate all merchant tokens on reuse detection", async () => {
      // Create test merchant
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Multi-Device Test Merchant",
          email: `test-rotation-multi-${Date.now()}@example.com`,
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Create multiple active sessions
      const session1 = await loginWithEmailPassword({
        email: merchant.email,
        password: "TestPassword123!",
        ipAddress: "192.168.1.1",
        userAgent: "device-1",
      });

      const session2 = await loginWithEmailPassword({
        email: merchant.email,
        password: "TestPassword123!",
        ipAddress: "192.168.1.2",
        userAgent: "device-2",
      });

      // Verify both sessions have active tokens
      let tokensBefore = await prisma.refreshToken.findMany({
        where: { merchantId: merchant.id, is_revoked: false },
      });
      expect(tokensBefore.length).toBe(2);

      // Use session 1's token once (rotates it)
      const rotated1 = await refreshAccessToken({
        refreshToken: session1.refresh_token,
        ipAddress: "192.168.1.1",
        userAgent: "device-1",
      });

      // Now try to reuse session 1's old token (breach scenario)
      try {
        await refreshAccessToken({
          refreshToken: session1.refresh_token,
          ipAddress: "10.0.0.1", // Different IP = suspicious
          userAgent: "attacker",
        });
        fail("Should have triggered reuse detection");
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
      }

      // ALL tokens for the merchant should now be invalidated
      const tokensAfter = await prisma.refreshToken.findMany({
        where: { merchantId: merchant.id },
      });

      // At least one token should be marked as reused
      expect(tokensAfter.some((t) => t.is_reused)).toBe(true);

      // All should be revoked
      expect(tokensAfter.every((t) => t.is_revoked)).toBe(true);
    });

    it("should add old token to Redis blocklist", async () => {
      // Create test merchant
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Blocklist Test Merchant",
          email: `test-rotation-blocklist-${Date.now()}@example.com`,
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Login to get tokens
      const loginResult = await loginWithEmailPassword({
        email: merchant.email,
        password: "TestPassword123!",
        ipAddress: "127.0.0.1",
        userAgent: "test-client",
      });

      const oldRefreshToken = loginResult.refresh_token;

      // Refresh the token (should add old token to blocklist)
      const refreshResult = await refreshAccessToken({
        refreshToken: oldRefreshToken,
        ipAddress: "127.0.0.1",
        userAgent: "test-client",
      });

      // The old token should now be in the blocklist
      // (Attempting to use it again should trigger reuse detection)
      try {
        await refreshAccessToken({
          refreshToken: oldRefreshToken,
          ipAddress: "127.0.0.1",
          userAgent: "test-client",
        });
        fail("Should have detected blocklisted token");
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
      }
    });
  });
});
