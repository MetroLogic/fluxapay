import { Router } from "express";
import {
  getPaymentsList,
  getPaymentDetails,
  exportPayments,
} from "../controllers/payment.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// Apply authentication middleware to all payment routes
router.use(authenticateToken);

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: List payments with filtering, sorting, and pagination
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, cancelled]
 *         description: Filter by payment status
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Filter by currency (e.g., USD, EUR, XLM)
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter payments from this date onwards
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter payments up to this date
 *       - in: query
 *         name: amount_min
 *         schema:
 *           type: number
 *         description: Minimum payment amount
 *       - in: query
 *         name: amount_max
 *         schema:
 *           type: number
 *         description: Maximum payment amount
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by payment_id, order_id, or customer email
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [date, amount, status]
 *           default: date
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of payments with pagination info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       payment_id:
 *                         type: string
 *                       order_id:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       status:
 *                         type: string
 *                       customer:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           email:
 *                             type: string
 *                           name:
 *                             type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       transaction_hash:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", getPaymentsList);

/**
 * @swagger
 * /api/payments/{paymentId}:
 *   get:
 *     summary: Get detailed information about a specific payment
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 payment_id:
 *                   type: string
 *                 order_id:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 currency:
 *                   type: string
 *                 status:
 *                   type: string
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       transaction_hash:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       source_account:
 *                         type: string
 *                       destination_account:
 *                         type: string
 *                       status:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 timeline_events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       event_type:
 *                         type: string
 *                       description:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 transaction_hash:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Server error
 */
router.get("/:paymentId", getPaymentDetails);

/**
 * @swagger
 * /api/payments/export:
 *   get:
 *     summary: Export payments to CSV format
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, cancelled]
 *         description: Filter by payment status
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Filter by currency
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter payments from this date onwards
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter payments up to this date
 *       - in: query
 *         name: amount_min
 *         schema:
 *           type: number
 *         description: Minimum payment amount
 *       - in: query
 *         name: amount_max
 *         schema:
 *           type: number
 *         description: Maximum payment amount
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by payment_id, order_id, or customer email
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv]
 *           default: csv
 *         description: Export format (currently only CSV is supported)
 *     responses:
 *       200:
 *         description: CSV file with payment data
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/export", exportPayments);

export default router;
