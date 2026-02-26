import { Router } from "express";
import {
  getWebhookLogs,
  getWebhookLogDetails,
  retryWebhook,
  sendTestWebhook,
} from "../controllers/webhook.controller";
import { validate, validateQuery } from "../middleware/validation.middleware";
import * as webhookSchema from "../schemas/webhook.schema";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/webhooks/logs:
 *   get:
 *     summary: Get webhook logs list
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: event_type
 *         schema:
 *           type: string
 *           enum: [payment_completed, payment_failed, payment_pending, refund_completed, refund_failed, subscription_created, subscription_cancelled, subscription_renewed]
 *         description: Filter by event type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, delivered, failed, retrying]
 *         description: Filter by webhook status
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs until this date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by webhook_id or payment_id
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Webhook logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/logs",
  authenticateToken,
  validateQuery(webhookSchema.getWebhookLogsSchema),
  getWebhookLogs
);

/**
 * @swagger
 * /api/webhooks/logs/{log_id}:
 *   get:
 *     summary: Get webhook log details
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: log_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The webhook log ID
 *     responses:
 *       200:
 *         description: Webhook log details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     event_type:
 *                       type: string
 *                     endpoint_url:
 *                       type: string
 *                     request_payload:
 *                       type: object
 *                     response_body:
 *                       type: string
 *                     http_status:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     retry_attempts:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Webhook log not found
 *       401:
 *         description: Unauthorized
 */
router.get("/logs/:log_id", authenticateToken, getWebhookLogDetails);

/**
 * @swagger
 * /api/webhooks/logs/{log_id}/retry:
 *   post:
 *     summary: Retry a failed webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: log_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The webhook log ID to retry
 *     responses:
 *       200:
 *         description: Webhook retry initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     http_status:
 *                       type: integer
 *                     retry_count:
 *                       type: integer
 *       400:
 *         description: Webhook already delivered successfully
 *       404:
 *         description: Webhook log not found
 *       401:
 *         description: Unauthorized
 */
router.post("/logs/:log_id/retry", authenticateToken, retryWebhook);

/**
 * @swagger
 * /api/webhooks/test:
 *   post:
 *     summary: Send a test webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_type
 *               - endpoint_url
 *             properties:
 *               event_type:
 *                 type: string
 *                 enum: [payment_completed, payment_failed, payment_pending, refund_completed, refund_failed, subscription_created, subscription_cancelled, subscription_renewed]
 *                 description: The type of webhook event to simulate
 *               endpoint_url:
 *                 type: string
 *                 format: uri
 *                 description: The URL to send the test webhook to
 *               payload_override:
 *                 type: object
 *                 description: Optional custom payload data to override defaults
 *     responses:
 *       200:
 *         description: Test webhook sent. The delivery includes
 *           `X-FluxaPay-Signature` and `X-FluxaPay-Timestamp` headers signed
 *           using the merchant's webhook secret; clients should verify the
 *           signature by recomputing the HMAC over the timestamp and body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     event_type:
 *                       type: string
 *                     endpoint_url:
 *                       type: string
 *                     request_payload:
 *                       type: object
 *                     response_body:
 *                       type: string
 *                     http_status:
 *                       type: integer
 *                     status:
 *                       type: string
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/test",
  authenticateToken,
  validate(webhookSchema.sendTestWebhookSchema),
  sendTestWebhook
);

export default router;
