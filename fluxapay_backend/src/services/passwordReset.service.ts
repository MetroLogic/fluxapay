/**
 * passwordReset.service.ts
 *
 * Forgot-password / reset-password flow for merchant accounts.
 *
 * Reset tokens are single-use and stored in Redis (never in the database, and
 * never in plaintext — only a SHA-256 fingerprint of the raw token is used as
 * the Redis key), matching the pattern already used for the refresh-token
 * blocklist in auth.service.ts. A token is consumed atomically the instant
 * it's redeemed (Redis GETDEL), so a stolen or replayed token can never be
 * used a second time — closing the exact reuse window described in #1064.
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";
import { redisClient } from "../middleware/redisIdempotency.middleware";
import { sendPasswordResetEmail } from "./email.service";
import { invalidateAllMerchantTokens } from "./auth.service";
import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

const RESET_TOKEN_PREFIX = "password_reset:";
const RESET_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const BCRYPT_COST = 10; // matches merchant.service.ts signup hashing cost

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Step 1: request a reset link. Always resolves with the same generic
 * message regardless of whether the email belongs to a registered merchant,
 * so this endpoint can't be used to enumerate accounts.
 */
export async function requestPasswordResetService(data: { email: string }) {
  const { email } = data;
  const genericResult = {
    message: "If an account with that email exists, a password reset link has been sent.",
  };

  const merchant = await prisma.merchant.findUnique({ where: { email } });
  if (!merchant) {
    return genericResult;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenKey = `${RESET_TOKEN_PREFIX}${hashToken(rawToken)}`;

  // NX would refuse to overwrite an in-flight token, but a fresh request
  // should always supersede any earlier unused one, so a plain SET is right
  // here (unlike the atomic-claim use case in auth.service.ts's refresh flow).
  await redisClient.set(tokenKey, merchant.id, "EX", RESET_TOKEN_TTL_SECONDS);

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(merchant.email, resetUrl).catch((err) => {
    console.error("[PasswordReset] Failed to send reset email:", err);
  });

  return genericResult;
}

/**
 * Step 2 (optional, used by the frontend to decide whether to render the
 * reset form before the user submits a new password): check whether a token
 * is currently valid, WITHOUT consuming it.
 */
export async function validatePasswordResetTokenService(data: {
  token?: string;
  query?: { token?: string };
}) {
  const token = data.token ?? data.query?.token;
  if (!token) {
    throw apiError(400, ErrorCode.VALIDATION_ERROR, "token is required");
  }

  const tokenKey = `${RESET_TOKEN_PREFIX}${hashToken(token)}`;
  const merchantId = await redisClient.get(tokenKey);
  return { valid: Boolean(merchantId) };
}

/**
 * Step 3: consume the token and set the new password. The token is fetched
 * and deleted atomically (GETDEL) — there is no separate "read, then delete"
 * step, so two concurrent requests presenting the same token can never both
 * succeed, and any request after the first always sees the token as gone.
 */
export async function resetPasswordService(data: { token: string; new_password: string }) {
  const { token, new_password: password } = data;
  if (!token || !password) {
    throw apiError(400, ErrorCode.VALIDATION_ERROR, "token and new_password are required");
  }

  const tokenKey = `${RESET_TOKEN_PREFIX}${hashToken(token)}`;
  const merchantId = await redisClient.getdel(tokenKey);

  if (!merchantId) {
    throw apiError(
      400,
      ErrorCode.INVALID_TOKEN,
      "This password reset link is invalid or has already been used. Please request a new one.",
    );
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { password: hashedPassword },
  });

  // A password reset should outlive no prior session: revoke every
  // outstanding refresh token so a previously-stolen one can't survive it.
  await invalidateAllMerchantTokens(merchantId).catch((err) => {
    console.error("[PasswordReset] Failed to invalidate sessions after reset:", err);
  });

  return { message: "Password reset successful. Please log in with your new password." };
}
