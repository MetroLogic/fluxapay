import Redis from 'ioredis';
import { assertOtpEmailRateLimit } from '../otpEmailRateLimiter';
import { resetRedisClientForTests, setRedisClientForTests } from '../../sms/otpSmsRateLimiter';

function redisMock() {
  const values = new Map<string, { count: number; expiresAt?: number }>();
  return {
    values,
    async incr(key: string) {
      const entry = values.get(key) ?? { count: 0 };
      entry.count += 1;
      values.set(key, entry);
      return entry.count;
    },
    async expire(key: string, seconds: number) {
      const entry = values.get(key);
      if (entry) entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    async ttl(key: string) {
      const entry = values.get(key);
      if (!entry?.expiresAt) return -1;
      return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    },
  };
}

describe('OTP email rate limiter', () => {
  const originalEnv = process.env;
  let redis: ReturnType<typeof redisMock>;

  beforeEach(() => {
    process.env = { ...originalEnv, OTP_EMAIL_MAX_PER_WINDOW: '3', OTP_EMAIL_WINDOW_SECONDS: '600' };
    redis = redisMock();
    setRedisClientForTests(redis as unknown as Redis);
  });

  afterEach(() => {
    resetRedisClientForTests();
    process.env = originalEnv;
  });

  it('allows requests under the configured limit', async () => {
    await expect(assertOtpEmailRateLimit('victim@example.com')).resolves.toBeUndefined();
    await expect(assertOtpEmailRateLimit('victim@example.com')).resolves.toBeUndefined();
  });

  it('allows the request at the configured limit', async () => {
    await assertOtpEmailRateLimit('victim@example.com');
    await assertOtpEmailRateLimit('victim@example.com');

    await expect(assertOtpEmailRateLimit('victim@example.com')).resolves.toBeUndefined();
  });

  it('rejects requests over the configured limit with a retry time and audit event', async () => {
    const audit = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await assertOtpEmailRateLimit('victim@example.com');
    await assertOtpEmailRateLimit('victim@example.com');
    await assertOtpEmailRateLimit('victim@example.com');

    await expect(assertOtpEmailRateLimit('victim@example.com')).rejects.toMatchObject({
      status: 429,
      code: 'OTP_EMAIL_RATE_LIMIT',
      retryAfterSeconds: 600,
    });
    expect(audit).toHaveBeenCalledWith(expect.stringContaining('otp_email_rate_limit'));
    audit.mockRestore();
  });
});
