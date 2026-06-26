import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { DepositAddressService } from "../services/depositAddress.service";

export async function getAddressPoolStats(req: Request, res: Response) {
  try {
    const stats = await DepositAddressService.getPoolStats();
    res.status(200).json({ data: stats });
  } catch (error: any) {
    sendApiError(res, apiError(500, ErrorCode.POOL_STATS_FAILED, error.message || "Failed to retrieve pool stats"));
  }
}
