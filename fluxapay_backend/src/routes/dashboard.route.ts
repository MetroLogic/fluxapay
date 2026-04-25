import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
const router = Router();

router.use(authenticateApiKey);
// all the routes for dashboard should be authenticated 

/**
 * @swagger
 * /api/v1/dashboard/overview/metrics:
 *   get:
 *     summary: Get dashboard summary metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Dashboard overview recovered"
 *                 data:
 *                   type: object
 *                   properties:
 *                     revenue:
 *                       type: object
 *                       properties:
 *                         today:
 *                           type: number
 *                           example: 120000
 *                         week:
 *                           type: number
 *                           example: 840000
 *                         month:
 *                           type: number
 *                           example: 3120000
 *                     payments:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: number
 *                           example: 1240
 *                         amount:
 *                           type: number
 *                           example: 3960000
 *                     pending_payments:
 *                       type: number
 *                       example: 18
 *                     success_rate:
 *                       type: number
 *                       example: 96.3
 *                     average_transaction_value:
 *                       type: number
 *                       example: 3193.55
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/metrics", dashboardController.overviewMetrics);

/**
 * @swagger
 * /api/v1/dashboard/overview/charts:
 *   get:
 *     summary: Get dashboard analytics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Dashboard analytics recovered"
 *                 data:
 *                   type: object
 *                   properties:
 *                     volume_over_time:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           period:
 *                             type: string
 *                             example: "2026-01-18"
 *                           count:
 *                             type: number
 *                             example: 32
 *                           amount:
 *                             type: number
 *                             example: 124000
 *                     status_breakdown:
 *                       type: object
 *                       properties:
 *                         success:
 *                           type: number
 *                           example: 1120
 *                         pending:
 *                           type: number
 *                           example: 18
 *                         failed:
 *                           type: number
 *                           example: 102
 *                     revenue_trend:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           period:
 *                             type: string
 *                             example: "2026-01"
 *                           revenue:
 *                             type: number
 *                             example: 3120000
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/charts", dashboardController.analytics);

/**
 * @swagger
 * /api/v1/dashboard/overview/activity:
 *   get:
 *     summary: Get dashboard activity
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard activity retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Dashboard activity recovered"
 *                 data:
 *                   type: object
 *                   properties:
 *                     recent_payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "pay_123"
 *                           amount:
 *                             type: number
 *                             example: 5000
 *                           status:
 *                             type: string
 *                             example: "SUCCESS"
 *                           customer:
 *                             type: string
 *                             example: "John Doe"
 *                           created_at:
 *                             type: string
 *                             example: "2026-01-23T14:22:10Z"
 *                     recent_settlements:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "set_456"
 *                           amount:
 *                             type: number
 *                             example: 120000
 *                           status:
 *                             type: string
 *                             example: "COMPLETED"
 *                           settled_at:
 *                             type: string
 *                             example: "2026-01-22T09:00:00Z"
 *                     failed_alerts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "pay_789"
 *                           reason:
 *                             type: string
 *                             example: "Insufficient funds"
 *                           created_at:
 *                             type: string
 *                             example: "2026-01-23T10:11:42Z"
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/activity", dashboardController.activity);

/**
 * @swagger
 * /api/v1/dashboard/audit-logs:
 *   get:
 *     summary: Get audit logs for the authenticated merchant (read-only)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: action_type
 *         schema:
 *           type: string
 *           enum: [merchant_profile_updated, bank_account_updated, api_key_rotated, webhook_secret_rotated]
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Audit logs for the merchant
 *       401:
 *         description: Unauthorized
 */
router.get("/audit-logs", dashboardController.getMerchantAuditLogs);

export default router;

/**
 * @swagger
 * /api/v1/dashboard/overview/metrics:
 *   get:
 *     summary: Get dashboard summary metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Dashboard overview recovered"
 *                 data:
 *                   type: object
 *                   properties:
 *                     revenue:
 *                       type: object
 *                       properties:
 *                         today:
 *                           type: number
 *                           example: 120000
 *                         week:
 *                           type: number
 *                           example: 840000
 *                         month:
 *                           type: number
 *                           example: 3120000
 *                     payments:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: number
 *                           example: 1240
 *                         amount:
 *                           type: number
 *                           example: 3960000
 *                     pending_payments:
 *                       type: number
 *                       example: 18
 *                     success_rate:
 *                       type: number
 *                       example: 96.3
 *                     average_transaction_value:
 *                       type: number
 *                       example: 3193.55
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/metrics", dashboardController.overviewMetrics);

/**
 * @swagger
 * /api/v1/dashboard/overview/charts:
 *   get:
 *     summary: Get dashboard analytics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Dashboard analytics recovered"
 *                 data:
 *                   type: object
 *                   properties:
 *                     volume_over_time:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           period:
 *                             type: string
 *                             example: "2026-01-18"
 *                           count:
 *                             type: number
 *                             example: 32
 *                           amount:
 *                             type: number
 *                             example: 124000
 *                     status_breakdown:
 *                       type: object
 *                       properties:
 *                         success:
 *                           type: number
 *                           example: 1120
 *                         pending:
 *                           type: number
 *                           example: 18
 *                         failed:
 *                           type: number
 *                           example: 102
 *                     revenue_trend:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           period:
 *                             type: string
 *                             example: "2026-01"
 *                           revenue:
 *                             type: number
 *                             example: 3120000
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/charts", dashboardController.analytics);

/**
 * @swagger
 * /api/v1/dashboard/overview/activity:
 *   get:
 *     summary: Get dashboard activity
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard activity retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Dashboard activity recovered"
 *                 data:
 *                   type: object
 *                   properties:
 *                     recent_payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "pay_123"
 *                           amount:
 *                             type: number
 *                             example: 5000
 *                           status:
 *                             type: string
 *                             example: "SUCCESS"
 *                           customer:
 *                             type: string
 *                             example: "John Doe"
 *                           created_at:
 *                             type: string
 *                             example: "2026-01-23T14:22:10Z"
 *                     recent_settlements:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "set_456"
 *                           amount:
 *                             type: number
 *                             example: 120000
 *                           status:
 *                             type: string
 *                             example: "COMPLETED"
 *                           settled_at:
 *                             type: string
 *                             example: "2026-01-22T09:00:00Z"
 *                     failed_alerts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "pay_789"
 *                           reason:
 *                             type: string
 *                             example: "Insufficient funds"
 *                           created_at:
 *                             type: string
 *                             example: "2026-01-23T10:11:42Z"
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/activity", dashboardController.activity);

export default router;
