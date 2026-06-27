import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { DepositAddressService } from "../services/depositAddress.service";
import { getLogger } from "../utils/logger";

const logger = getLogger();

export async function getAddressPoolStats(req: Request, res: Response) {
  try {
    const stats = await DepositAddressService.getPoolStats();

    // Alert if available < 50
    if (stats.available < 50) {
      logger.warn(`Address pool low: only ${stats.available} addresses available (threshold: 50)`);
    }

    res.status(200).json({
      data: {
        ...stats,
        alert: stats.available < 50 ? `Low address availability: ${stats.available}` : null,
      },
    });
  } catch (error: any) {
    sendApiError(res, apiError(500, ErrorCode.POOL_STATS_FAILED, error.message || "Failed to retrieve pool stats"));
  }
}
