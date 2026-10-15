import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Router } from 'express';
import { query } from 'express-validator';
import {
  createPayment,
  getPayments,
  exportPayments,
  getPaymentById,
  updatePayment,
  getPaymentStatus,
  streamPaymentStatus,
  getPublicCheckoutPayment,
  getPublicCheckoutPaymentStatus,
  getPaymentSettlement,
} from '../controllers/payment.controller';
import { validatePayment, validateUpdatePayment } from '../validators/payment.validator';
import { authenticateApiKey } from '../middleware/apiKeyAuth.middleware';
import { merchantApiKeyRateLimit } from '../middleware/rateLimit.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { ipRateLimit } from "../middleware/ipRateLimit.middleware";
import { kycGateMiddleware } from '../middleware/kycGate.middleware';
import { validatePagination } from '../validators/pagination.validator';

const router = Router();

// Redis token-bucket limits for unauthenticated endpoints, keyed by client IP
// so a single client cannot enumerate or hammer payment ids. Thresholds can be
// tuned per limiter via env (e.g. PAYMENT_STATUS_RATE_LIMIT_CAPACITY).
const publicPaymentStatusRateLimit = ipRateLimit({
  name: "payments:status",
  envPrefix: "PAYMENT_STATUS_RATE_LIMIT",
  capacity: 30,
  refillPerSecond: 1,
});

const publicPaymentStreamRateLimit = ipRateLimit({
  name: "payments:stream",
  envPrefix: "PAYMENT_STREAM_RATE_LIMIT",
  capacity: 15,
  refillPerSecond: 0.5,
});

// Hosted checkout polls status every few seconds, so it gets a larger bucket.
const publicCheckoutRateLimit = ipRateLimit({
  name: "checkout",
  envPrefix: "CHECKOUT_RATE_LIMIT",
  capacity: 60,
  refillPerSecond: 2,
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
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Optional unique key for idempotent request handling. If provided, duplicate requests within 24h return the cached response.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       201:
 *         description: Payment created
 *       200:
 *         description: Payment response replayed from cache (when duplicate Idempotency-Key within 24h)
 *       400:
 *         description: Bad request or invalid idempotency key
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
 *         description: Unique identifier of the payment.
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
 *         description: Unique identifier of the payment.
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
 *         description: Unique identifier of the payment.
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
  sendApiError(res, apiError(404, ErrorCode.CHECKOUT_SSE_UNAVAILABLE, "Checkout SSE is not available; use polling"));
});
router.get('/checkout/:id/status', publicCheckoutRateLimit, getPublicCheckoutPaymentStatus);
router.get('/checkout/:id', publicCheckoutRateLimit, getPublicCheckoutPayment);

router.post('/', authenticateApiKey, kycGateMiddleware, merchantApiKeyRateLimit(), idempotencyMiddleware, validatePayment, createPayment);

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
 *         description: Page number to return (1-indexed).
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         description: Maximum number of items to return per page.
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         description: Filter by payment status.
 *         schema: { type: string }
 *       - in: query
 *         name: currency
 *         description: Filter by ISO 4217 currency code (e.g. USD, NGN).
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         description: Case-insensitive free-text search term.
 *         schema: { type: string }
 *       - in: query
 *         name: date_from
 *         description: Only include records created on or after this date (ISO 8601).
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: date_to
 *         description: Only include records created on or before this date (ISO 8601).
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated list of payments
 */
router.get('/', authenticateApiKey, merchantApiKeyRateLimit(), validatePagination, getPayments);

/**
 * @swagger
 * /api/v1/payments/export:
 *   get:
 *     summary: Export the transaction history as a CSV file
 *     description: >
 *       Streams a CSV of every payment matching the supplied filters. Rows are
 *       written to the response in batches, so exports of large histories do
 *       not time out and are not buffered in memory. Rows are ordered
 *       chronologically (oldest first).
 *     tags: [Payments]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         description: Inclusive start of the range (YYYY-MM-DD or ISO date-time)
 *         schema: { type: string }
 *       - in: query
 *         name: date_to
 *         description: Inclusive end of the range; a bare YYYY-MM-DD includes the whole day
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         description: Filter by payment status.
 *         schema: { type: string }
 *       - in: query
 *         name: currency
 *         description: Filter by ISO 4217 currency code (e.g. USD, NGN).
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         description: Matches the payment ID or the customer email
 *         schema: { type: string }
 *       - in: query
 *         name: amount_min
 *         description: Only include records with an amount greater than or equal to this value.
 *         schema: { type: number }
 *       - in: query
 *         name: amount_max
 *         description: Only include records with an amount less than or equal to this value.
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: CSV file download (text/csv)
 *         headers:
 *           Content-Disposition:
 *             schema: { type: string }
 *           X-Export-Row-Count:
 *             schema: { type: integer }
 *           X-Export-Truncated:
 *             description: Present when the export hit the row cap
 *             schema: { type: string }
 *       400:
 *         description: Invalid date range or filters
 *       401:
 *         description: Unauthorized
 */
router.get('/export', authenticateApiKey, merchantApiKeyRateLimit(), exportPayments);

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
 *         description: Unique identifier of the payment.
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

/**
 * @swagger
 * /api/v1/payments/{id}:
 *   patch:
 *     summary: Update payment internal note or metadata
 *     tags: [Payments]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional internal note for merchant reference (not exposed to customer)
 *     responses:
 *       200:
 *         description: Updated payment details
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment not found
 */
router.patch('/:id', authenticateApiKey, merchantApiKeyRateLimit(), validateUpdatePayment, updatePayment);

/**
 * @swagger
 * /api/v1/payments/{id}/settlement:
 *   get:
 *     summary: Get settlement details for a payment
 *     tags: [Payments]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Settlement details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payment_id:
 *                   type: string
 *                 settled:
 *                   type: boolean
 *                 settlement:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     gross_usdc:
 *                       type: number
 *                     fee_usdc:
 *                       type: number
 *                     net_usdc:
 *                       type: number
 *                     fx_rate:
 *                       type: number
 *                     net_fiat:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     payout_channel:
 *                       type: string
 *                     exchange_ref:
 *                       type: string
 *                     transfer_ref:
 *                       type: string
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     processed_date:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment not found
 */
router.get('/:id/settlement', authenticateApiKey, merchantApiKeyRateLimit(), getPaymentSettlement);

export default router;
