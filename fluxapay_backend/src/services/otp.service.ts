import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient } from '../generated/client/client';
import { prisma } from "../config/prisma";
import { assertOtpEmailRateLimit } from './otpEmailRateLimiter';
import { getRedisClient } from '../sms/otpSmsRateLimiter';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Max consecutive failed verification attempts before the OTP is invalidated
// and the endpoint locked for this merchant/channel (closes #1062).
const MAX_OTP_FAILED_ATTEMPTS = positiveInteger(process.env.OTP_MAX_FAILED_ATTEMPTS, 5);
// How long the lockout persists once triggered.
const OTP_LOCKOUT_SECONDS = positiveInteger(process.env.OTP_LOCKOUT_SECONDS, 10 * 60);

function otpAttemptsKey(otpId: string): string {
  return `otp_failed_attempts:${otpId}`;
}

function otpLockedKey(merchantId: string, channel: 'email' | 'phone'): string {
  return `otp_locked:${merchantId}:${channel}`;
}

/** Structured security-audit log entry for a failed/locked OTP verification. */
function auditOtpFailure(
  merchantId: string,
  channel: 'email' | 'phone',
  attempts: number,
  locked: boolean,
): void {
  console.warn(JSON.stringify({
    level: 'warn',
    event: locked ? 'otp_verification_locked' : 'otp_verification_failed',
    message: locked
      ? 'OTP invalidated after exceeding max failed verification attempts'
      : 'OTP verification attempt failed',
    merchantId,
    channel,
    attempts,
    timestamp: new Date().toISOString(),
  }));
}

export async function createOtp(merchantId: string, channel: 'email' | 'phone', email?: string) {
  if (channel === 'email') {
    if (!email) throw new Error('Email is required when creating an email OTP');
    await assertOtpEmailRateLimit(email);
  }

  // Use CSPRNG instead of Math.random() to prevent predictable OTP codes (closes #1047)
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

  // delete previous OTP for channel
  await prisma.oTP.deleteMany({ where: { merchantId, channel } });

  await prisma.oTP.create({
    data: { merchantId, channel, code: hashedOtp, expires_at: expiresAt },
  });

  return otp;
}

export async function verifyOtp(merchantId: string, channel: 'email' | 'phone', otp: string) {
  const bypass = process.env.E2E_ACCEPT_OTP;
  if (process.env.NODE_ENV === 'test' && bypass && otp === bypass) {
    await prisma.oTP.deleteMany({ where: { merchantId, channel } });
    return { success: true };
  }

  const redis = getRedisClient();
  const lockKey = otpLockedKey(merchantId, channel);

  // A prior burst of failures may have already invalidated the OTP row, so
  // the lockout flag (rather than the OTP record) is the source of truth for
  // whether this merchant/channel is currently locked out.
  try {
    const locked = await redis.get(lockKey);
    if (locked) {
      return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'otp_lockout_redis_error',
      message: 'Failed to check OTP lockout state',
      error: (error as Error).message,
    }));
  }

  const otpRecord = await prisma.oTP.findUnique({ where: { merchantId_channel: { merchantId, channel } } });
  if (!otpRecord) return { success: false, message: 'OTP not found' };
  if (otpRecord.expires_at < new Date()) return { success: false, message: 'OTP expired' };

  const isValid = await bcrypt.compare(otp, otpRecord.code);
  if (!isValid) {
    const attemptsKey = otpAttemptsKey(otpRecord.id);
    let attempts = 0;
    try {
      attempts = await redis.incr(attemptsKey);
      if (attempts === 1) {
        const ttlSeconds = Math.max(
          1,
          Math.ceil((otpRecord.expires_at.getTime() - Date.now()) / 1000),
        );
        await redis.expire(attemptsKey, ttlSeconds);
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'otp_attempt_counter_redis_error',
        message: 'Failed to increment OTP failed-attempt counter',
        error: (error as Error).message,
      }));
    }

    const lockedOut = attempts >= MAX_OTP_FAILED_ATTEMPTS;
    auditOtpFailure(merchantId, channel, attempts, lockedOut);

    if (lockedOut) {
      // Invalidate the OTP and lock the endpoint so the merchant must
      // request a brand new OTP rather than continue guessing this one.
      await prisma.oTP.deleteMany({ where: { id: otpRecord.id } });
      try {
        await redis.set(lockKey, '1', 'EX', OTP_LOCKOUT_SECONDS);
        await redis.del(attemptsKey);
      } catch (error) {
        console.error(JSON.stringify({
          level: 'error',
          event: 'otp_lockout_redis_error',
          message: 'Failed to persist OTP lockout state',
          error: (error as Error).message,
        }));
      }
      return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
    }

    return { success: false, message: 'Invalid OTP' };
  }

  // OTP is valid, delete it and clear any attempt counter for it
  await prisma.oTP.delete({ where: { id: otpRecord.id } });
  try {
    await redis.del(otpAttemptsKey(otpRecord.id));
  } catch {
    // Non-fatal: the counter will expire on its own TTL.
  }
  return { success: true };
}
