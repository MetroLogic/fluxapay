import { Router } from "express";
import { createPayment } from "../controllers/payment.controller";
import { validatePayment } from "../validators/payment.validator";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { redisIdempotencyMiddleware } from "../middleware/redisIdempotency.middleware";

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
  redisIdempotencyMiddleware,
  validatePayment,
  createPayment
);

export default router;
