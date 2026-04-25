import { Router } from 'express';
import {
  createPayment,
  getPayments,
  getPaymentById,
  getPaymentStatus,
  streamPaymentStatus,
  getPublicCheckoutPayment,
  getPublicCheckoutPaymentStatus,
} from '../controllers/payment.controller';
import { validatePayment } from '../validators/payment.validator';
import { authenticateApiKey } from '../middleware/apiKeyAuth.middleware';
import { merchantApiKeyRateLimit } from '../middleware/rateLimit.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { simpleRateLimit } from "../middleware/simpleRateLimit.middleware";

const router = Router();

// Rate-limit unauthenticated status checks by IP *and* payment id so a single
// client cannot enumerate or hammer an arbitrary number of payment ids.
const publicPaymentStatusRateLimit = simpleRateLimit({
  keyPrefix: "payments:status",
  windowMs: 30_000,
  max: 30,
  getKey: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const paymentId = req.params.id || "unknown";
    return `${ip}:${paymentId}`;
  },
});

const publicPaymentStreamRateLimit = simpleRateLimit({
  keyPrefix: "payments:stream",
  windowMs: 30_000,
  max: 15,
});

/**
 * @swagger
 * /api/v1/payments/{id}/status:
 *   get:
 *     summary: Publicly accessible view of a payment's status
 *     tags: [Payments]
 *     description: Safe public DTO with minimal fields. No authentication required. Rate-limited by IP and payment ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment status details (PII-free)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: pay_123abc
 *                 status:
 *                   type: string
 *                   enum: [pending, confirmed, failed, expired, settled]
 *                   example: pending
 *                 amount:
 *                   type: number
 *                   example: 100.50
 *                 currency:
 *                   type: string
 *                   example: USDC
 *                 address:
 *                   type: string
 *                   description: Stellar address for payment
 *                   example: GBUQWP3BOUZX34ULNQG23RQ6F5DOBAB4NSTOF5AUFF6GPBK476QC6G5
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2026-04-24T12:30:00Z
 *       404:
 *         description: Payment not found
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/:id/status', publicPaymentStatusRateLimit, getPaymentStatus);

/**
 * @swagger
 * /api/v1/payments/{id}/stream:
 *   get:
 *     summary: SSE stream for real-time payment updates
 *     tags: [Payments]
 *     description: Server-Sent Events stream for real-time payment status updates. No authentication required. Rate-limited by IP.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: SSE stream of payment status updates
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [pending, confirmed, failed, expired, settled]
 *       404:
 *         description: Payment not found
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/:id/stream', publicPaymentStreamRateLimit, streamPaymentStatus);

/**
 * @swagger
 * /api/v1/payments:
 *   post:
 *     summary: Create payment intent
 *     tags: [Payments]
 *     security:
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
/**
 * @swagger
 * /api/v1/payments/checkout/{id}/stream:
 *   get:
 *     summary: Checkout SSE placeholder (returns not implemented)
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Placeholder (may return 404 in practice)
 *       404:
 *         description: SSE not available; use status polling
 */
/**
 * @swagger
 * /api/v1/payments/checkout/{id}/status:
 *   get:
 *     summary: Public checkout payment status
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status payload
 *       404:
 *         description: Not found
 */
/**
 * @swagger
 * /api/v1/payments/checkout/{id}:
 *   get:
 *     summary: Public hosted checkout payment details
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Checkout payment
 *       404:
 *         description: Not found
 */
/**
 * Hosted checkout (public, no API key) — must be registered before /:id
 */
router.get('/checkout/:id/stream', (_req, res) => {
  res.status(404).json({ error: 'Checkout SSE is not available; use polling' });
});
router.get('/checkout/:id/status', getPublicCheckoutPaymentStatus);
router.get('/checkout/:id', getPublicCheckoutPayment);

router.post('/', authenticateApiKey, merchantApiKeyRateLimit(), idempotencyMiddleware, validatePayment, createPayment);

/**
 * @swagger
 * /api/v1/payments:
 *   get:
 *     summary: List payments for the authenticated merchant
 *     tags: [Payments]
 *     security:
 *       - apiKeyAuth: []
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
router.get('/', authenticateApiKey, merchantApiKeyRateLimit(), getPayments);

/**
 * @swagger
 * /api/v1/payments/export:
 *   get:
 *     summary: Export payments as CSV
 *     tags: [Payments]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 */
router.get('/export', authenticateApiKey, merchantApiKeyRateLimit(), getPayments);

/**
 * @swagger
 * /api/v1/payments/{id}:
 *   get:
 *     summary: Get a single payment by ID
 *     tags: [Payments]
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
 *         description: Payment details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment not found
 */
router.get('/:id', authenticateApiKey, merchantApiKeyRateLimit(), getPaymentById);

export default router;
