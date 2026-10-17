import { Router } from "express";
import { getFxRates, getCachedFxRates } from "../controllers/fx.controller";

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

/**
 * @swagger
 * /api/v1/fx-rates/cached:
 *   get:
 *     summary: Get all cached FX rates (USDC to fiat)
 *     tags: [FX Rates]
 *     responses:
 *       200:
 *         description: Cached FX rates retrieved successfully
 */
router.get("/cached", getCachedFxRates);

export default router;
