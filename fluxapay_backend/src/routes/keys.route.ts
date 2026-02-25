import { Router } from "express";
import { regenerateApiKey } from "../controllers/keys.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/v1/keys/regenerate:
 *   post:
 *     summary: Regenerate API key for the authenticated merchant
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 apiKey:
 *                   type: string
 *                   description: Raw key shown only once; store it securely
 *       401:
 *         description: Unauthorized
 */
router.post("/regenerate", authenticateToken, regenerateApiKey);

export default router;
