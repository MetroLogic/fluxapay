import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import {
  selfRequestDeletion,
  selfGetDeletionRequest,
  adminRequestDeletion,
  adminExecuteDeletion,
} from "../controllers/merchantDeletion.controller";

const router = Router();

// ── Merchant self-service ─────────────────────────────────────────────────────
/**
 * @swagger
 * /api/v1/merchants/me/deletion-request:
 *   post:
 *     summary: Request account deletion (merchant self-service)
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Deletion request recorded
 *       400:
 *         description: Invalid state
 */
router.post("/me/deletion-request", authenticateApiKey, selfRequestDeletion);
/**
 * @swagger
 * /api/v1/merchants/me/deletion-request:
 *   get:
 *     summary: Get current deletion request status
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Deletion request status
 *       404:
 *         description: No deletion request
 */
router.get("/me/deletion-request", authenticateApiKey, selfGetDeletionRequest);

// ── Admin ─────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/v1/merchants/admin/{merchantId}/deletion-request:
 *   post:
 *     summary: Operator-initiated deletion request for a merchant
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Recorded
 *       403:
 *         description: Forbidden
 */
router.post("/admin/:merchantId/deletion-request", authenticateToken, adminAuth, adminRequestDeletion);
/**
 * @swagger
 * /api/v1/merchants/admin/{merchantId}/anonymize:
 *   post:
 *     summary: Execute PII anonymization for a merchant (compliance)
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Anonymization completed or accepted
 *       403:
 *         description: Forbidden
 */
router.post("/admin/:merchantId/anonymize", authenticateToken, adminAuth, adminExecuteDeletion);

export default router;
