import { Router } from "express";
import {
  initializeEscrow,
  releaseEscrow,
  refundEscrow,
} from "../controllers/escrow.controller";
import { validate } from "../middleware/validation.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import * as escrowSchema from "../schemas/escrow.schema";

const router = Router();

/**
 * @swagger
 * /api/v1/payments/{id}/escrow/initialize:
 *   post:
 *     summary: Initialize escrow contract for a payment
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payment_id
 *               - amount
 *               - currency
 *               - merchant_public_key
 *             properties:
 *               payment_id:
 *                 type: string
 *               amount:
 *                 type: string
 *               currency:
 *                 type: string
 *               merchant_public_key:
 *                 type: string
 *     responses:
 *       200:
 *         description: Escrow contract initialized successfully
 *       400:
 *         description: Invalid request or escrow already initialized
 *       404:
 *         description: Payment not found
 */
router.post(
  "/payments/:id/escrow/initialize",
  authenticateToken,
  validate(escrowSchema.initializeSchema),
  initializeEscrow
);

/**
 * @swagger
 * /api/v1/payments/{id}/escrow/release:
 *   post:
 *     summary: Release funds from escrow contract
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Escrow funds released successfully
 *       400:
 *         description: Invalid request or escrow already released
 *       403:
 *         description: Not authorized to release this escrow
 *       404:
 *         description: Payment not found
 */
router.post(
  "/payments/:id/escrow/release",
  authenticateToken,
  releaseEscrow
);

/**
 * @swagger
 * /api/v1/payments/{id}/escrow/refund:
 *   post:
 *     summary: Refund funds from escrow contract
 *     tags: [Escrow]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *               initiated_by:
 *                 type: string
 *                 enum: [admin, customer]
 *     responses:
 *       200:
 *         description: Escrow funds refunded successfully
 *       400:
 *         description: Invalid request or escrow already refunded
 *       404:
 *         description: Payment not found
 */
router.post(
  "/payments/:id/escrow/refund",
  adminAuth,
  refundEscrow
);

export default router;
