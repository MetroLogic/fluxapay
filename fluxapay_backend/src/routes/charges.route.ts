import { Router } from "express";
import { createPayment } from "../controllers/payment.controller";
import { validatePayment } from "../validators/payment.validator";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";
import { createRefund, listRefunds } from "../controllers/refund.controller";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { createRefundSchema, listRefundsQuerySchema } from "../schemas/refund.schema";

const router = Router();

/**
 * @swagger
 * /api/v1/charges:
 *   post:
 *     summary: Create an idempotent charge
 *     tags: [Charges]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID v4 for idempotency
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       201:
 *         description: Charge created
 *       200:
 *         description: Charge response replayed from cache
 *       400:
 *         description: Bad request (invalid idempotency key or payload)
 *       409:
 *         description: Idempotency conflict (request in-flight)
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  "/",
  authenticateApiKey,
  merchantApiKeyRateLimit(),
  idempotencyMiddleware,
  validatePayment,
  createPayment
);

/**
 * @swagger
 * /api/v1/charges/{id}/refunds:
 *   post:
 *     summary: Create a refund for a charge
 *     tags: [Charges]
 *     security:
 *       - apiKeyAuth: []
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
 *             properties:
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Refund created
 */
router.post(
  "/:id/refunds",
  authenticateApiKey,
  merchantApiKeyRateLimit(),
  idempotencyMiddleware,
  (req, res, next) => {
    req.body.payment_id = req.params.id;
    next();
  },
  validate(createRefundSchema),
  createRefund
);

/**
 * @swagger
 * /api/v1/charges/{id}/refunds:
 *   get:
 *     summary: List refunds for a charge
 *     tags: [Charges]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of refunds
 */
router.get(
  "/:id/refunds",
  authenticateApiKey,
  merchantApiKeyRateLimit(),
  validateQuery(listRefundsQuerySchema),
  listRefunds
);

export default router;
