import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  paymentPageLimiter,
  sseLimiter,
  getClientIp,
  isBotUserAgent,
  logAbuseEvent,
} from '@/lib/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('RateLimiter', () => {
    it('should allow requests within the limit', () => {
      const limiter = paymentPageLimiter;
      const clientIp = '192.168.1.1';

      // First 30 requests should be allowed
      for (let i = 0; i < 30; i++) {
        expect(limiter.isAllowed(clientIp)).toBe(true);
      }

      // 31st request should be denied
      expect(limiter.isAllowed(clientIp)).toBe(false);
    });

    it('should reject requests exceeding the limit', () => {
      const limiter = paymentPageLimiter;
      const clientIp = '192.168.1.2';

      // Fill up the limit
      for (let i = 0; i < 30; i++) {
        limiter.isAllowed(clientIp);
      }

      // Next request should be denied
      expect(limiter.isAllowed(clientIp)).toBe(false);
    });

    it('should allow requests again after window expires', () => {
      const limiter = paymentPageLimiter;
      const clientIp = '192.168.1.3';

      // Fill up the limit
      for (let i = 0; i < 30; i++) {
        limiter.isAllowed(clientIp);
      }
      expect(limiter.isAllowed(clientIp)).toBe(false);

      // Advance time past the window (60000ms)
      vi.advanceTimersByTime(61000);

      // Should allow again
      expect(limiter.isAllowed(clientIp)).toBe(true);
    });

    it('should return correct reset time', () => {
      const limiter = paymentPageLimiter;
      const clientIp = '192.168.1.4';

      // Make a request
      limiter.isAllowed(clientIp);

      // Fill up the limit
      for (let i = 1; i < 30; i++) {
        limiter.isAllowed(clientIp);
      }

      // Get reset time
      const resetMs = limiter.getResetTimeMs(clientIp);

      // Should be approximately 60000ms (the window)
      expect(resetMs).toBeGreaterThan(59000);
      expect(resetMs).toBeLessThanOrEqual(60000);
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from X-Forwarded-For header', () => {
      const request = {
        headers: new Headers({
          'x-forwarded-for': '10.0.0.1, 10.0.0.2',
        }),
      };
      expect(getClientIp(request)).toBe('10.0.0.1');
    });

    it('should extract IP from CF-Connecting-IP header', () => {
      const request = {
        headers: new Headers({
          'cf-connecting-ip': '203.0.113.1',
        }),
      };
      expect(getClientIp(request)).toBe('203.0.113.1');
    });

    it('should extract IP from X-Real-IP header', () => {
      const request = {
        headers: new Headers({
          'x-real-ip': '192.0.2.1',
        }),
      };
      expect(getClientIp(request)).toBe('192.0.2.1');
    });

    it('should return "unknown" if no IP header found', () => {
      const request = {
        headers: new Headers(),
      };
      expect(getClientIp(request)).toBe('unknown');
    });
  });

  describe('isBotUserAgent', () => {
    it('should detect common bot patterns', () => {
      expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
      expect(isBotUserAgent('curl/7.68.0')).toBe(true);
      expect(isBotUserAgent('wget/1.20.3')).toBe(true);
      expect(isBotUserAgent('python-requests/2.28.0')).toBe(true);
      expect(isBotUserAgent('scrapy/2.6.1')).toBe(true);
    });

    it('should allow legitimate browsers', () => {
      expect(
        isBotUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
      ).toBe(false);
      expect(
        isBotUserAgent(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)'
        )
      ).toBe(false);
    });

    it('should handle null user agent', () => {
      expect(isBotUserAgent(null)).toBe(false);
    });
  });

  describe('logAbuseEvent', () => {
    it('should log abuse events with correct structure', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const eventType = 'rate_limit_exceeded';
      const ip = '192.168.1.1';
      const details = { path: '/pay/payment_123', requestCount: 31 };

      logAbuseEvent(eventType, ip, details);

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0]?.[0];
      expect(callArg).toContain('ABUSE DETECTED');
      expect(callArg).toContain(eventType);

      consoleSpy.mockRestore();
    });
  });

  describe('sseLimiter', () => {
    it('should have stricter limits than payment page limiter', () => {
      // SSE limiter should be 10 requests per 60 seconds
      // vs payment page limiter at 30 per 60 seconds
      const sseIp = '192.168.1.100';
      const paymentIp = '192.168.1.101';

      // Fill SSE limiter
      for (let i = 0; i < 10; i++) {
        sseLimiter.isAllowed(sseIp);
      }
      expect(sseLimiter.isAllowed(sseIp)).toBe(false);

      // Fill payment limiter
      for (let i = 0; i < 30; i++) {
        paymentPageLimiter.isAllowed(paymentIp);
      }
      expect(paymentPageLimiter.isAllowed(paymentIp)).toBe(false);
    });
  });
});
