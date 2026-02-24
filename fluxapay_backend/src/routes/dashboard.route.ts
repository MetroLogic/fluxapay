import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller";
import { authenticateToken } from "../middleware/auth.middleware";
const router = Router();

router.use(authenticateToken);
// all the routes for dashboard should be authenticated 

/**
 * @swagger
 * /api/dashboard/overview/metrics:
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
 *                 revenue:
 *                   type: object
 *                   properties:
 *                     today:
 *                       type: number
 *                       example: 120000
 *                     week:
 *                       type: number
 *                       example: 840000
 *                     month:
 *                       type: number
 *                       example: 3120000
 *                 payments:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                       example: 1240
 *                     amount:
 *                       type: number
 *                       example: 3960000
 *                 pending_payments:
 *                   type: number
 *                   example: 18
 *                 success_rate:
 *                   type: number
 *                   example: 96.3
 *                 average_transaction_value:
 *                   type: number
 *                   example: 3193.55
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/metrics", dashboardController.overviewMetrics);

/**
 * @swagger
 * /api/dashboard/overview/charts:
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
 *                 volume_over_time:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: string
 *                         example: "2026-01-18"
 *                       count:
 *                         type: number
 *                         example: 32
 *                       amount:
 *                         type: number
 *                         example: 124000
 *                 status_breakdown:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: number
 *                       example: 1120
 *                     pending:
 *                       type: number
 *                       example: 18
 *                     failed:
 *                       type: number
 *                       example: 102
 *                 revenue_trend:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: string
 *                         example: "2026-01"
 *                       revenue:
 *                         type: number
 *                         example: 3120000
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/charts", dashboardController.analytics);

/**
 * @swagger
 * /api/dashboard/overview/activity:
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
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "67890"
 *                   type:
 *                     type: string
 *                     example: "Payment"
 *                   status:
 *                     type: string
 *                     example: "Completed"
 *                   amount:
 *                     type: number
 *                     example: 124000
 *                   created_at:
 *                     type: string
 *                     example: "2026-01-18T12:00:00.000Z"
 *       401:
 *         description: Unauthorized, token missing or invalid
 */
router.get("/overview/activity", dashboardController.activity);

export default router;
