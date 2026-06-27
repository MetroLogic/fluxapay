import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { trackApiCallUsage } from "../middleware/usageLimit.middleware";
import { getMerchantUsageHandler } from "../controllers/usage.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/merchants/me/usage:
 *   get:
 *     summary: Get current billing period usage vs plan limits
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Current period usage
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/me/usage",
  authenticateApiKey,
  merchantApiKeyRateLimit(),
  trackApiCallUsage(),
  getMerchantUsageHandler,
);

export default router;
