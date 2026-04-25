/**
 * Oracle Routes
 * 
 * Admin endpoints for monitoring and managing the payment oracle service
 */

import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import * as oracleController from "../controllers/oracle.controller";

const router = Router();

/**
 * @swagger
 * /admin/oracle/metrics:
 *   get:
 *     summary: Get oracle performance metrics
 *     tags: [Admin, Oracle]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Oracle metrics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/admin/oracle/metrics", authenticateToken, adminAuth, oracleController.getMetrics);

/**
 * @swagger
 * /admin/oracle/health:
 *   get:
 *     summary: Get oracle health status
 *     tags: [Admin, Oracle]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Oracle is healthy
 *       503:
 *         description: Oracle is unhealthy
 *       500:
 *         description: Server error
 */
router.get("/admin/oracle/health", authenticateToken, adminAuth, oracleController.getHealth);

/**
 * @swagger
 * /admin/oracle/verify/{paymentId}:
 *   post:
 *     summary: Manually verify a payment
 *     tags: [Admin, Oracle]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID to verify
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Invalid payment ID
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Server error
 */
router.post("/admin/oracle/verify/:paymentId", authenticateToken, adminAuth, oracleController.verifyPayment);

export default router;
