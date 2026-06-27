import { Response } from "express";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import { sendApiError } from "../helpers/apiError.helper";
import { getMerchantUsage, queryAdminUsage } from "../services/usage.service";

export async function getMerchantUsageHandler(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const usage = await getMerchantUsage(merchantId);
    res.json({ usage });
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}

export async function adminQueryUsageHandler(req: AuthRequest, res: Response) {
  try {
    const merchantId = req.query.merchant_id as string | undefined;
    const overLimit = req.query.over_limit === "true";
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;

    const result = await queryAdminUsage({ merchantId, overLimit, page, limit });
    res.json(result);
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}
