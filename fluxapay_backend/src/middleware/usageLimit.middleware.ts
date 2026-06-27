import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express";
import {
  checkUsageLimit,
  enforceUsageLimitError,
  incrementUsage,
  UsageMetric,
} from "../services/usage.service";

/**
 * Enforce plan usage limits for a specific metric.
 * Call after authentication so req.merchantId is available.
 */
export function enforcePlanUsageLimit(metric: UsageMetric) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      const merchantId = req.merchantId ?? req.user?.id;
      if (!merchantId) return next();

      const { allowed, usage, retryAfterSeconds } = await checkUsageLimit(merchantId, metric);
      if (!allowed) {
        enforceUsageLimitError(usage, retryAfterSeconds);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Increment API call counter after successful authenticated requests.
 */
export function trackApiCallUsage() {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const merchantId = req.merchantId ?? req.user?.id;
    if (merchantId) {
      incrementUsage(merchantId, "api_calls").catch((err) =>
        console.error("[Usage] api_calls increment failed:", err),
      );
    }
    next();
  };
}
