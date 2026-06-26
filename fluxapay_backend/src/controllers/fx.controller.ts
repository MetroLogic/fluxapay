import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { FxService } from "../services/fx.service";

export async function getFxRates(req: Request, res: Response) {
  try {
    const currency = (req.query.currency as string) || "USD";
    const rate = await FxService.getUSDCExchangeRate(currency);

    res.status(200).json({
      data: {
        base_currency: currency.toUpperCase(),
        target_currency: "USDC",
        rate: rate,
      },
    });
  } catch (error: any) {
    sendApiError(res, apiError(500, ErrorCode.FX_FETCH_FAILED, error.message || "Failed to fetch FX rates"));
  }
}
