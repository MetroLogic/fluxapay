/**
 * Rate limiting utilities for abuse protection on public payment pages and SSE endpoints.
 * Uses in-memory sliding window implementation.
 * Note: In production with multiple server instances, consider using Redis.
 */

interface RateLimitEntry {
  timestamps: number[];
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if a client has exceeded the rate limit.
   * Returns true if the request should be allowed, false if it should be rate-limited.
   */
  public isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key) || { timestamps: [] };

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(ts => now - ts < this.windowMs);

    if (entry.timestamps.length < this.maxRequests) {
      entry.timestamps.push(now);
      this.store.set(key, entry);
      return true;
    }

    return false;
  }

  /**
   * Get the number of requests made by a client in the current window.
   */
  public getRequestCount(key: string): number {
    const entry = this.store.get(key);
    if (!entry) return 0;
    const now = Date.now();
    return entry.timestamps.filter(ts => now - ts < this.windowMs).length;
  }

  /**
   * Get milliseconds until the next request is allowed.
   */
  public getResetTimeMs(key: string): number {
    const entry = this.store.get(key);
    if (!entry || entry.timestamps.length === 0) return 0;
    const oldest = entry.timestamps[0];
    const resetTime = oldest + this.windowMs;
    const now = Date.now();
    return Math.max(0, resetTime - now);
  }
}

// Per-IP rate limiter for payment pages: 30 requests per 60 seconds
export const paymentPageLimiter = new RateLimiter(60000, 30);

// Per-IP rate limiter for SSE connections: stricter limit
export const sseLimiter = new RateLimiter(60000, 10);

/**
 * Extract client IP from NextRequest headers.
 * Checks X-Forwarded-For (proxy), CF-Connecting-IP (Cloudflare), and falls back to socket address.
 */
export function getClientIp(request: Request | { headers: Headers }): string {
  const headers = request instanceof Request ? request.headers : (request as { headers: Headers }).headers;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  const cloudflare = headers.get('cf-connecting-ip');
  if (cloudflare) {
    return cloudflare;
  }

  const xff = headers.get('x-real-ip');
  if (xff) {
    return xff;
  }

  return 'unknown';
}

/**
 * Check if the User-Agent indicates a bot or automated client.
 * Returns true if detected as potential bot.
 */
export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;

  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java(?!script)/i,
    /postman/i,
    /insomnia/i,
    /axios/i,
    /node-fetch/i,
  ];

  return botPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Log abuse event (rate limit hit, excessive connections, bot detection, etc)
 */
export function logAbuseEvent(eventType: string, ip: string, details: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    eventType,
    ip,
    ...details,
  };

  // In production, send to logging service (Sentry, DataDog, CloudWatch, etc)
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[ABUSE DETECTED] ${JSON.stringify(logEntry)}`);
  } else {
    // Log to external service in production
    console.warn(`[ABUSE DETECTED] ${eventType} from ${ip}`, details);
  }
}
