import type { Request, Response, NextFunction, RequestHandler } from "express";

type RateLimitOptions = {
  /**
   * Maximum number of requests allowed within `windowMs`.
   */
  max: number;
  /**
   * Rolling window size in milliseconds.
   */
  windowMs: number;
  /**
   * Optional key prefix so multiple limiters don't collide.
   */
  keyPrefix?: string;
  /**
   * Optional override for how we identify the caller.
   */
  getKey?: (req: Request) => string;
};

type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();

function nowMs() {
  return Date.now();
}

function getIp(req: Request) {
  // Express `req.ip` respects `trust proxy` when configured at the app level.
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function simpleRateLimit(options: RateLimitOptions): RequestHandler {
  const { max, windowMs, keyPrefix = "rl", getKey } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${getKey ? getKey(req) : getIp(req)}`;
    const t = nowMs();

    const existing = counters.get(key);
    if (!existing || existing.resetAt <= t) {
      counters.set(key, { count: 1, resetAt: t + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - t) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: "Rate limit exceeded",
        retry_after_seconds: retryAfterSeconds,
      });
    }

    return next();
  };
}

