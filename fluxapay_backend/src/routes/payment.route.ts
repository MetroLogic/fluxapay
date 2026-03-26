import { Router } from 'express';
import { createPayment, getPayments, getPaymentById, getPaymentStatus, streamPaymentStatus } from '../controllers/payment.controller';
import { validatePayment } from '../validators/payment.validator';
import { authenticateToken } from '../middleware/auth.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { simpleRateLimit } from "../middleware/simpleRateLimit.middleware";

const router = Router();

const publicPaymentStatusRateLimit = simpleRateLimit({
  keyPrefix: "payments:status",
  windowMs: 30_000,
  max: 60,
});

const publicPaymentStreamRateLimit = simpleRateLimit({
  keyPrefix: "payments:stream",
  windowMs: 30_000,
  max: 15,
});

/**
 * @swagger
 * /api/v1/payments/:id/status:
 *   get:
 *     summary: Publicly accessible view of a payment's status
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment status details
 *       404:
 *         description: Payment not found
 */
router.get('/:id/status', publicPaymentStatusRateLimit, getPaymentStatus);

/**
 * @swagger
 * /api/v1/payments/:id/stream:
 *   get:
 *     summary: SSE stream for real-time payment updates
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SSE stream
 */
router.get('/:id/stream', publicPaymentStreamRateLimit, streamPaymentStatus);

/**
 * @swagger
 * /api/v1/payments:
 *   post:
 *     summary: Create payment intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       201:
 *         description: Payment created
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', authenticateToken, idempotencyMiddleware, validatePayment, createPayment);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get payment by ID (merchant-scoped)
 * /api/payments:
 *   get:
 *     summary: List payments for the authenticated merchant
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: currency
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated list of payments
 */
router.get('/', authenticateToken, getPayments);

/**
 * @swagger
 * /api/payments/export:
 *   get:
 *     summary: Export payments as CSV
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 */
router.get('/export', authenticateToken, getPayments);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get a single payment by ID
 *     tags: [Payments]
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
 *         description: Payment details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment not found
 */
router.get('/:id', authenticateToken, getPaymentById);

export default router;
