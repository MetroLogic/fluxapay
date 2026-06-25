import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import {
  requestExport,
  getExportStatus,
  downloadExportHandler,
  adminRequestExport,
  adminDownloadExport,
} from "../controllers/dataExport.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/merchants/export:
 *   post:
 *     summary: Request a data export for the authenticated merchant
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       202:
 *         description: Export job accepted
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticateApiKey, merchantApiKeyRateLimit(), requestExport);
/**
 * @swagger
 * /api/v1/merchants/export/{jobId}:
 *   get:
 *     summary: Get data export job status
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Export job status
 *       404:
 *         description: Job not found
 */
router.get("/:jobId", authenticateApiKey, getExportStatus);
/**
 * @swagger
 * /api/v1/merchants/export/{jobId}/download:
 *   get:
 *     summary: Download completed export payload
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Export payload
 *       404:
 *         description: Job not found or not ready
 */
router.get("/:jobId/download", authenticateApiKey, merchantApiKeyRateLimit(), downloadExportHandler);

// ── Admin routes ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/v1/merchants/export/admin/{merchantId}:
 *   post:
 *     summary: Operator-triggered data export for a merchant
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202:
 *         description: Export job accepted
 *       403:
 *         description: Forbidden
 */
router.post("/admin/:merchantId", authenticateToken, adminAuth, adminRequestExport);
/**
 * @swagger
 * /api/v1/merchants/export/admin/{merchantId}/{jobId}/download:
 *   get:
 *     summary: Operator download of merchant export artifact
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Export payload
 *       404:
 *         description: Not found
 */
router.get("/admin/:merchantId/:jobId/download", authenticateToken, adminAuth, adminDownloadExport);

export default router;
