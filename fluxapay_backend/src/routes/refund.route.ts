import { Router } from "express";
import {
  initiateRefundController,
  getRefundController,
  listRefundsController,
} from "../controllers/refund.controller";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
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
 *       - adminSecret: []
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
 *       401:
 *         description: Unauthorized - missing or invalid admin secret
 *       403:
 *         description: Unauthorized - missing or invalid merchant token
 *       409:
 *         description: Duplicate refund for this payment
 *       502:
 *         description: Stellar network error
 */
router.post(
  "/",
  authenticateToken,
  adminAuth,
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
 *       - adminSecret: []
 *     parameters:
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
 *       401:
 *         description: Unauthorized - missing or invalid admin secret
 *       403:
 *         description: Unauthorized - missing or invalid merchant token
 */
router.get(
  "/",
  authenticateToken,
  adminAuth,
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
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: refundId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund details
 *       401:
 *         description: Unauthorized - missing or invalid admin secret
 *       403:
 *         description: Unauthorized - missing or invalid merchant token
 *       404:
 *         description: Refund not found
 */
router.get(
  "/:refundId",
  authenticateToken,
  adminAuth,
  getRefundController,
);

export default router;
