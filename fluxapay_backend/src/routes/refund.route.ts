import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";
import {
  createRefund,
  listRefunds,
  updateRefundStatus,
} from "../controllers/refund.controller";
import {
  createRefundSchema,
  listRefundsQuerySchema,
  updateRefundStatusSchema,
} from "../schemas/refund.schema";

const router = Router();

/**
 * @swagger
 * /api/v1/refunds:
 *   post:
 *     summary: Create a refund
 *     tags: [Refunds]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRefundRequest'
 *     responses:
 *       201:
 *         description: Refund created
 *   get:
 *     summary: List merchant refunds
 *     tags: [Refunds]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *     responses:
 *       200:
 *         description: Refunds retrieved
 */
router.post(
  "/",
  authenticateApiKey, merchantApiKeyRateLimit(),
  idempotencyMiddleware,
  validate(createRefundSchema),
  createRefund,
);
router.get(
  "/",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validateQuery(listRefundsQuerySchema),
  listRefunds,
);

/**
 * @swagger
 * /api/v1/refunds/{refund_id}/status:
 *   patch:
 *     summary: Update refund status and emit webhook
 *     tags: [Refunds]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: refund_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRefundStatusRequest'
 *     responses:
 *       200:
 *         description: Refund status updated
 *       404:
 *         description: Refund not found
 */
router.patch(
  "/:refund_id/status",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validate(updateRefundStatusSchema),
  updateRefundStatus,
);

export default router;
