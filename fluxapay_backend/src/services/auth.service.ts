import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { PrismaClient } from "../generated/client/client";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshTokenPair } from "../helpers/jwt.helper";
import { sendSecurityAlertEmail } from "./email.service";

const prisma = new PrismaClient();

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const FAILED_LOGIN_THRESHOLD = 10;
const ACCOUNT_LOCKOUT_MINUTES = 15;
const BCRYPT_COST = 12;

/**
 * Login with email and password, returns access token and refresh token
 * Implements account lockout after 10 failed attempts within 15 minutes
 */
export async function loginWithEmailPassword(data: {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { email, password, ipAddress, userAgent } = data;

  // Check for account lockout
  const recentFailedAttempts = await prisma.loginAttempt.findMany({
    where: {
      email,
      success: false,
      created_at: {
        gte: new Date(Date.now() - ACCOUNT_LOCKOUT_MINUTES * 60 * 1000),
      },
    },
  });

  if (recentFailedAttempts.length >= FAILED_LOGIN_THRESHOLD) {
    // Log this attempt as failed
    await prisma.loginAttempt.create({
      data: {
        merchantId: "unknown",
        email,
        ip_address: ipAddress || "unknown",
        success: false,
      },
    });
    throw apiError(
      429,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      "Account locked due to too many failed login attempts. Please try again later.",
      { retryAfterSeconds: ACCOUNT_LOCKOUT_MINUTES * 60 },
    );
  }

  const merchant = await prisma.merchant.findUnique({ where: { email } });

  if (!merchant) {
    // Log failed attempt
    await prisma.loginAttempt.create({
      data: {
        merchantId: "unknown",
        email,
        ip_address: ipAddress || "unknown",
        success: false,
      },
    });
    throw apiError(400, ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
  }

  if (merchant.status !== "active") {
    throw apiError(403, ErrorCode.ACCOUNT_NOT_ACTIVE, "Account not active");
  }

  const match = await bcrypt.compare(password, merchant.password);
  if (!match) {
    // Log failed attempt
    await prisma.loginAttempt.create({
      data: {
        merchantId: merchant.id,
        email,
        ip_address: ipAddress || "unknown",
        success: false,
      },
    });
    throw apiError(400, ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
  }

  // Log successful attempt
  await prisma.loginAttempt.create({
    data: {
      merchantId: merchant.id,
      email,
      ip_address: ipAddress || "unknown",
      success: true,
    },
  });

  // Generate access token (15 min expiry)
  const accessToken = generateAccessToken(merchant.id, merchant.email, "merchant");

  // Generate refresh token (30 day expiry)
  const { token: refreshToken, hash: refreshTokenHash } = generateRefreshTokenPair();
  const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      merchantId: merchant.id,
      token_hash: hashedRefreshToken,
      expires_at: expiresAt,
      created_at_ip: ipAddress,
      created_at_user_agent: userAgent,
    },
  });

  return {
    message: "Login successful",
    merchantId: merchant.id,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 900, // 15 minutes in seconds
  };
}

/**
 * Refresh access token using refresh token with rotation
 * Old refresh token is invalidated immediately
 * Returns new access token and new refresh token
 */
export async function refreshAccessToken(data: {
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { refreshToken, ipAddress, userAgent } = data;

  // Find the refresh token by hash (we need to hash the incoming token to compare)
  // Since we can't query by hash without knowing it, we'll get all active tokens for the merchant
  // This is less efficient but necessary for security (opaque tokens)
  
  // First, we need to find which merchant this token belongs to
  // We'll need to iterate through active tokens and check hashes
  // In production with many tokens, this should be optimized with Redis caching
  
  // For now, let's get the merchant ID from the access token if provided
  // But the spec says we only get refresh token, so we need a different approach
  
  // Alternative: store a mapping of token hash -> merchant in Redis
  // For now, we'll use a less efficient approach but it works
  
  // Get all non-revoked, non-expired tokens
  const activeTokens = await prisma.refreshToken.findMany({
    where: {
      is_revoked: false,
      is_reused: false,
      expires_at: {
        gte: new Date(),
      },
    },
    include: {
      merchant: true,
    },
  });

  // Find the matching token by comparing hashes
  let matchedToken = null;
  for (const token of activeTokens) {
    const isValid = await bcrypt.compare(refreshToken, token.token_hash);
    if (isValid) {
      matchedToken = token;
      break;
    }
  }

  if (!matchedToken) {
    // Token not found - could be expired, revoked, or never existed
    throw apiError(401, ErrorCode.INVALID_REFRESH_TOKEN, "Invalid or expired refresh token");
  }

  // Check if token has been reused (security incident)
  if (matchedToken.is_reused) {
    // This is a reuse detection - invalidate ALL tokens for this merchant
    await invalidateAllMerchantTokens(matchedToken.merchantId);
    
    // Send security alert email
    await sendSecurityAlertEmail({
      to: matchedToken.merchant.email,
      subject: "Security Alert: Potential Token Theft Detected",
      message: "We detected a potential security incident with your account. All sessions have been invalidated for your protection. Please login again.",
    });
    
    throw apiError(
      403,
      ErrorCode.FORBIDDEN,
      "Security incident detected. All sessions have been invalidated. Please login again.",
    );
  }

  // Revoke the old refresh token (rotation)
  await prisma.refreshToken.update({
    where: { id: matchedToken.id },
    data: {
      is_revoked: true,
      revoked_at: new Date(),
    },
  });

  // Generate new access token
  const accessToken = generateAccessToken(
    matchedToken.merchant.id,
    matchedToken.merchant.email,
    "merchant"
  );

  // Generate new refresh token
  const { token: newRefreshToken, hash: newRefreshTokenHash } = generateRefreshTokenPair();
  const hashedNewRefreshToken = await bcrypt.hash(newRefreshToken, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Store new refresh token
  await prisma.refreshToken.create({
    data: {
      merchantId: matchedToken.merchantId,
      token_hash: hashedNewRefreshToken,
      expires_at: expiresAt,
      created_at_ip: ipAddress,
      created_at_user_agent: userAgent,
    },
  });

  return {
    access_token: accessToken,
    refresh_token: newRefreshToken,
    expires_in: 900, // 15 minutes in seconds
  };
}

/**
 * Logout by invalidating the current refresh token
 */
export async function logout(data: {
  refreshToken: string;
}) {
  const { refreshToken } = data;

  // Find and revoke the token
  const activeTokens = await prisma.refreshToken.findMany({
    where: {
      is_revoked: false,
      expires_at: {
        gte: new Date(),
      },
    },
  });

  for (const token of activeTokens) {
    const isValid = await bcrypt.compare(refreshToken, token.token_hash);
    if (isValid) {
      await prisma.refreshToken.update({
        where: { id: token.id },
        data: {
          is_revoked: true,
          revoked_at: new Date(),
        },
      });
      return { message: "Logout successful" };
    }
  }

  // Token not found but we don't want to leak this info
  return { message: "Logout successful" };
}

/**
 * Logout from all devices by invalidating all refresh tokens for a merchant
 */
export async function logoutAll(data: {
  merchantId: string;
}) {
  const { merchantId } = data;

  await prisma.refreshToken.updateMany({
    where: {
      merchantId,
      is_revoked: false,
    },
    data: {
      is_revoked: true,
      revoked_at: new Date(),
    },
  });

  return { message: "Logged out from all devices" };
}

/**
 * Invalidate all refresh tokens for a merchant (security incident response)
 */
async function invalidateAllMerchantTokens(merchantId: string) {
  await prisma.refreshToken.updateMany({
    where: {
      merchantId,
      is_revoked: false,
    },
    data: {
      is_revoked: true,
      revoked_at: new Date(),
    },
  });
}

/**
 * Detect refresh token reuse and trigger security response
 * This is called when a revoked token is presented
 */
export async function detectTokenReuse(data: {
  refreshToken: string;
}) {
  const { refreshToken } = data;

  // Find all revoked tokens
  const revokedTokens = await prisma.refreshToken.findMany({
    where: {
      is_revoked: true,
      is_reused: false, // Not yet marked as reused
    },
    include: {
      merchant: true,
    },
  });

  for (const token of revokedTokens) {
    const isValid = await bcrypt.compare(refreshToken, token.token_hash);
    if (isValid) {
      // Mark this token as reused
      await prisma.refreshToken.update({
        where: { id: token.id },
        data: { is_reused: true },
      });

      // Invalidate ALL tokens for this merchant
      await invalidateAllMerchantTokens(token.merchantId);

      // Send security alert email
      await sendSecurityAlertEmail({
        to: token.merchant.email,
        subject: "Security Alert: Token Reuse Detected",
        message: "We detected a reuse of a previously invalidated refresh token. This may indicate token theft. All sessions have been invalidated for your protection. Please login again and change your password.",
      });

      return { detected: true, merchantId: token.merchantId };
    }
  }

  return { detected: false };
}

/**
 * Check if a merchant account is currently locked
 */
export async function checkAccountLockout(email: string): Promise<{ locked: boolean; retryAfter?: number }> {
  const recentFailedAttempts = await prisma.loginAttempt.findMany({
    where: {
      email,
      success: false,
      created_at: {
        gte: new Date(Date.now() - ACCOUNT_LOCKOUT_MINUTES * 60 * 1000),
      },
    },
  });

  if (recentFailedAttempts.length >= FAILED_LOGIN_THRESHOLD) {
    const oldestAttempt = recentFailedAttempts[recentFailedAttempts.length - FAILED_LOGIN_THRESHOLD];
    const lockoutEnd = new Date(oldestAttempt.created_at.getTime() + ACCOUNT_LOCKOUT_MINUTES * 60 * 1000);
    const retryAfter = Math.max(0, Math.ceil((lockoutEnd.getTime() - Date.now()) / 1000));
    
    return { locked: true, retryAfter };
  }

  return { locked: false };
}

/**
 * Clean up expired refresh tokens (run periodically)
 */
export async function cleanupExpiredTokens() {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      expires_at: {
        lt: new Date(),
      },
    },
  });
  
  return { deleted: result.count };
}

/**
 * Clean up old login attempts (run periodically, keep last 30 days)
 */
export async function cleanupOldLoginAttempts() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.loginAttempt.deleteMany({
    where: {
      created_at: {
        lt: thirtyDaysAgo,
      },
    },
  });
  
  return { deleted: result.count };
}
