import {
  loginWithEmailPassword,
  refreshAccessToken,
  logout,
  logoutAll,
  detectTokenReuse,
  checkAccountLockout,
  cleanupExpiredTokens,
  cleanupOldLoginAttempts,
} from "../auth.service";
import { PrismaClient } from "../../generated/client/client";
import bcrypt from "bcrypt";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/fluxapay_test?schema=public";
process.env.JWT_SECRET = process.env.JWT_SECRET || "ci-test-jwt-secret-key";

const prisma = new PrismaClient();

function uniquePhone(): string {
  return `+188801${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

describe("Auth Service", () => {
  beforeAll(async () => {
    // Setup test database
    // Note: This would typically use a test database URL
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const merchantFilter = {
      OR: [
        { email: { contains: "test-auth" } },
        { email: { contains: "test-lockout" } },
        { email: { contains: "test-notlocked" } },
        { email: { contains: "test-cleanup" } },
        { phone_number: { startsWith: "+188801" } },
      ],
    };

    const merchants = await prisma.merchant.findMany({
      where: merchantFilter,
      select: { id: true },
    });
    const merchantIds = merchants.map((m) => m.id);

    if (merchantIds.length > 0) {
      await prisma.refund.deleteMany({ where: { merchantId: { in: merchantIds } } });
      await prisma.payment.deleteMany({ where: { merchantId: { in: merchantIds } } });
      await prisma.refreshToken.deleteMany({ where: { merchantId: { in: merchantIds } } });
    }

    await prisma.loginAttempt.deleteMany({
      where: {
        OR: [
          { email: { contains: "test-auth" } },
          { email: { contains: "test-lockout" } },
          { email: { contains: "test-notlocked" } },
          { email: { contains: "test-cleanup" } },
        ],
      },
    });
    await prisma.merchant.deleteMany({ where: merchantFilter });
  });

  describe("loginWithEmailPassword", () => {
    it("should login successfully with valid credentials", async () => {
      // Create test merchant
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const result = await loginWithEmailPassword({
        email: "test-auth@example.com",
        password: "TestPassword123!",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      });

      expect(result).toHaveProperty("access_token");
      expect(result).toHaveProperty("refresh_token");
      expect(result).toHaveProperty("merchantId", merchant.id);
      expect(result.expires_in).toBe(900); // 15 minutes
    });

    it("should fail with invalid credentials", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      await expect(
        loginWithEmailPassword({
          email: "test-auth@example.com",
          password: "WrongPassword!",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toMatchObject({
        status: 400,
        message: "Invalid credentials",
      });
    });

    it("should lock account after 10 failed attempts", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth-lockout@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Create 10 failed login attempts
      for (let i = 0; i < 10; i++) {
        await prisma.loginAttempt.create({
          data: {
            merchantId: "test",
            email: "test-auth-lockout@example.com",
            ip_address: "127.0.0.1",
            success: false,
          },
        });
      }

      await expect(
        loginWithEmailPassword({
          email: "test-auth-lockout@example.com",
          password: "TestPassword123!",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toMatchObject({
        status: 429,
        message: expect.stringContaining("Account locked"),
      });
    });

    it("should fail for inactive accounts", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth-inactive@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "pending_verification",
        },
      });

      await expect(
        loginWithEmailPassword({
          email: "test-auth-inactive@example.com",
          password: "TestPassword123!",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toMatchObject({
        status: 403,
        message: "Account not active",
      });
    });
  });

  describe("refreshAccessToken", () => {
    it("should refresh token successfully with valid refresh token", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth-refresh@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Create a refresh token
      const refreshToken = "test-refresh-token-123";
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
      await prisma.refreshToken.create({
        data: {
          merchantId: merchant.id,
          token_hash: hashedRefreshToken,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          created_at_ip: "127.0.0.1",
        },
      });

      const result = await refreshAccessToken({
        refreshToken,
        ipAddress: "127.0.0.1",
      });

      expect(result).toHaveProperty("access_token");
      expect(result).toHaveProperty("refresh_token");
      expect(result.expires_in).toBe(900);
    });

    it("should fail with invalid refresh token", async () => {
      await expect(
        refreshAccessToken({
          refreshToken: "invalid-token",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toMatchObject({
        status: 401,
        message: "Invalid or expired refresh token",
      });
    });

    it("should rotate refresh token (invalidate old one)", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth-rotation@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const refreshToken = "test-refresh-token-rotation";
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
      const oldToken = await prisma.refreshToken.create({
        data: {
          merchantId: merchant.id,
          token_hash: hashedRefreshToken,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          created_at_ip: "127.0.0.1",
        },
      });

      await refreshAccessToken({
        refreshToken,
        ipAddress: "127.0.0.1",
      });

      // Check that old token is revoked
      const revokedToken = await prisma.refreshToken.findUnique({
        where: { id: oldToken.id },
      });
      expect(revokedToken?.is_revoked).toBe(true);
    });
  });

  describe("logout", () => {
    it("should logout successfully by invalidating refresh token", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth-logout@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const refreshToken = "test-refresh-token-logout";
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
      const token = await prisma.refreshToken.create({
        data: {
          merchantId: merchant.id,
          token_hash: hashedRefreshToken,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          created_at_ip: "127.0.0.1",
        },
      });

      const result = await logout({ refreshToken });

      expect(result.message).toBe("Logout successful");

      const revokedToken = await prisma.refreshToken.findUnique({
        where: { id: token.id },
      });
      expect(revokedToken?.is_revoked).toBe(true);
    });
  });

  describe("logoutAll", () => {
    it("should logout from all devices", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth-logoutall@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Create multiple refresh tokens
      for (let i = 0; i < 3; i++) {
        const refreshToken = `test-refresh-token-${i}`;
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
        await prisma.refreshToken.create({
          data: {
            merchantId: merchant.id,
            token_hash: hashedRefreshToken,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            created_at_ip: "127.0.0.1",
          },
        });
      }

      const result = await logoutAll({ merchantId: merchant.id });

      expect(result.message).toBe("Logged out from all devices");

      const remainingTokens = await prisma.refreshToken.findMany({
        where: { merchantId: merchant.id, is_revoked: false },
      });
      expect(remainingTokens.length).toBe(0);
    });
  });

  describe("detectTokenReuse", () => {
    it("should detect token reuse and invalidate all tokens", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: "test-auth-reuse@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const reusedToken = "test-reused-token";
      const hashedReusedToken = await bcrypt.hash(reusedToken, 12);
      
      // Create a revoked token
      await prisma.refreshToken.create({
        data: {
          merchantId: merchant.id,
          token_hash: hashedReusedToken,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          is_revoked: true,
          is_reused: false,
          created_at_ip: "127.0.0.1",
        },
      });

      // Create another active token
      await prisma.refreshToken.create({
        data: {
          merchantId: merchant.id,
          token_hash: await bcrypt.hash("other-token", 12),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          is_revoked: false,
          created_at_ip: "127.0.0.1",
        },
      });

      const result = await detectTokenReuse({ refreshToken: reusedToken });

      expect(result.detected).toBe(true);

      // Check that all tokens are now revoked
      const remainingTokens = await prisma.refreshToken.findMany({
        where: { merchantId: merchant.id, is_revoked: false },
      });
      expect(remainingTokens.length).toBe(0);
    });
  });

  describe("checkAccountLockout", () => {
    it("should return locked status when threshold exceeded", async () => {
      // Create 10 failed attempts
      for (let i = 0; i < 10; i++) {
        await prisma.loginAttempt.create({
          data: {
            merchantId: "test",
            email: "test-lockout@example.com",
            ip_address: "127.0.0.1",
            success: false,
          },
        });
      }

      const result = await checkAccountLockout("test-lockout@example.com");

      expect(result.locked).toBe(true);
      expect(result.retryAfter).toBeDefined();
    });

    it("should return not locked when threshold not exceeded", async () => {
      // Create only 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await prisma.loginAttempt.create({
          data: {
            merchantId: "test",
            email: "test-notlocked@example.com",
            ip_address: "127.0.0.1",
            success: false,
          },
        });
      }

      const result = await checkAccountLockout("test-notlocked@example.com");

      expect(result.locked).toBe(false);
    });
  });

  describe("cleanup functions", () => {
    it("should cleanup expired tokens", async () => {
      const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Auth Merchant",
          email: `test-auth-cleanup-${Date.now()}@example.com`,
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: hashedPassword,
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      // Create expired token
      await prisma.refreshToken.create({
        data: {
          merchantId: merchant.id,
          token_hash: await bcrypt.hash("expired-token", 12),
          expires_at: new Date(Date.now() - 1000), // Expired
          created_at_ip: "127.0.0.1",
        },
      });

      const result = await cleanupExpiredTokens();

      expect(result.deleted).toBeGreaterThan(0);
    });

    it("should cleanup old login attempts", async () => {
      // Create old login attempt (31 days ago)
      await prisma.loginAttempt.create({
        data: {
          merchantId: "test",
          email: "test-cleanup@example.com",
          ip_address: "127.0.0.1",
          success: false,
          created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });

      const result = await cleanupOldLoginAttempts();

      expect(result.deleted).toBeGreaterThan(0);
    });
  });
});
