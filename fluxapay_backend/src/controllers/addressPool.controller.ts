import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { DepositAddressService } from "../services/depositAddress.service";
import { getLogger } from "../utils/logger";

const logger = getLogger();

export async function getAddressPoolStats(req: Request, res: Response) {
  try {
    const stats = await DepositAddressService.getPoolStats();

    // Alert if available < 50 or utilization >= 80%
    if (stats.utilizationPct >= 0.8 || stats.available < 50) {
      logger.warn(
        `Address pool alert: utilization at ${(stats.utilizationPct * 100).toFixed(1)}%, ${stats.availableCount} available`,
      );
    }

    res.status(200).json({
      data: {
        ...stats,
        alert:
          stats.utilizationPct >= 0.8
            ? `High address pool utilization: ${(stats.utilizationPct * 100).toFixed(1)}%`
            : stats.available < 50
              ? `Low address availability: ${stats.available}`
              : null,
      },
    });
  } catch (error: any) {
    sendApiError(res, apiError(500, ErrorCode.POOL_STATS_FAILED, error.message || "Failed to retrieve pool stats"));
  }
}
