import { Router } from "express";
import {
  initiateRefundController,
  getRefundController,
  listRefundsController,
} from "../controllers/refund.controller";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import { authorizeAdmin } from "../middleware/admin.middleware";
import * as refundSchema from "../schemas/refund.schema";

const router = Router();

/**
 * @swagger
 * /api/refunds:
 *   post:
 *     summary: Initiate a refund
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-API-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin API key for authorization
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentId
 *               - merchantId
 *               - amount
 *               - currency
 *               - customerAddress
 *               - reason
 *             properties:
 *               paymentId:
 *                 type: string
 *               merchantId:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 enum: [USDC, XLM]
 *               customerAddress:
 *                 type: string
 *                 description: Stellar public key (G...)
 *               reason:
 *                 type: string
 *                 enum: [customer_request, duplicate_payment, failed_delivery, merchant_request, dispute_resolution]
 *               reasonNote:
 *                 type: string
 *     responses:
 *       201:
 *         description: Refund initiated and completed
 *       400:
 *         description: Validation error
 *       403:
 *         description: Unauthorized - missing or invalid admin API key
 *       409:
 *         description: Duplicate refund for this payment
 *       502:
 *         description: Stellar network error
 */
router.post(
  "/",
  authenticateToken,
  authorizeAdmin,
  validate(refundSchema.initiateRefundSchema),
  initiateRefundController,
);

/**
 * @swagger
 * /api/refunds:
 *   get:
 *     summary: List refunds with optional filters
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-API-Key
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: paymentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: merchantId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [initiated, processing, completed, failed]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of refunds with pagination
 *       403:
 *         description: Unauthorized
 */
router.get(
  "/",
  authenticateToken,
  authorizeAdmin,
  validateQuery(refundSchema.listRefundsSchema),
  listRefundsController,
);

/**
 * @swagger
 * /api/refunds/{refundId}:
 *   get:
 *     summary: Get a single refund by ID
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-API-Key
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: refundId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund details
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: Refund not found
 */
router.get(
  "/:refundId",
  authenticateToken,
  authorizeAdmin,
  getRefundController,
);

export default router;
