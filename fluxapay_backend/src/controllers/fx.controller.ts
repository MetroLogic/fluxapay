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
    res.status(500).json({ error: error.message || "Failed to fetch FX rates" });
  }
}
