import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { regenerateApiKey } from "../controllers/keys.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/keys/regenerate:
 *   post:
 *     summary: Regenerate merchant API key
 *     tags: [Keys]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: mode
 *         required: false
 *         schema:
 *           type: string
 *           enum: [live, test]
 *         description: Key environment. "test" issues a sk_test_ key for the isolated test-mode partition (default: live).
 *     responses:
 *       200:
 *         description: New API key generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 apiKey:
 *                   type: string
 */
router.post("/regenerate", authenticateApiKey, merchantApiKeyRateLimit(), regenerateApiKey);

export default router;
