import { Router } from "express";
import { getFxRates } from "../controllers/fx.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/fx-rates:
 *   get:
 *     summary: Get live FX rates to USDC
 *     tags: [FX Rates]
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           default: USD
 *         description: Base fiat currency
 *     responses:
 *       200:
 *         description: FX rate retrieved successfully
 */
router.get("/", getFxRates);

export default router;
