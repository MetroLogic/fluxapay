import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { FxService } from "../services/fx.service";
import { getAllCachedFxRates } from "../services/exchange.service";

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

export async function getCachedFxRates(req: Request, res: Response) {
  try {
    const rates = await getAllCachedFxRates();

    res.status(200).json({
      data: {
        rates,
        count: Object.keys(rates).length,
      },
    });
  } catch (error: any) {
    sendApiError(res, apiError(500, ErrorCode.FX_FETCH_FAILED, error.message || "Failed to fetch cached FX rates"));
  }
}
