import { Router } from "express";
import {
    runReconciliation,
    listReconciliations,
    getReconciliationDetails,
    listAlerts,
    acknowledgeAlert,
    reviewReconciliation,
    getReconciliationSummary,
} from "../controllers/reconciliation.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import * as reconciliationSchema from "../schemas/reconciliation.schema";

const router = Router();

router.use(authenticateToken);

/**
 * @swagger
 * /api/reconciliation/summary:
 *   get:
 *     summary: Get reconciliation dashboard summary
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconciliation summary stats
 */
router.get("/summary", getReconciliationSummary);

/**
 * @swagger
 * /api/reconciliation/run:
 *   post:
 *     summary: Run a new reconciliation
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - period_start
 *               - period_end
 *             properties:
 *               period_start:
 *                 type: string
 *                 format: date
 *               period_end:
 *                 type: string
 *                 format: date
 *               actual_balance:
 *                 type: number
 *     responses:
 *       200:
 *         description: Reconciliation result
 */
router.post("/run", validate(reconciliationSchema.runReconciliationSchema), runReconciliation);

/**
 * @swagger
 * /api/reconciliation:
 *   get:
 *     summary: List reconciliation records
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
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
 *           enum: [all, pending, matched, discrepancy, reviewed, resolved]
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of reconciliation records
 */
router.get("/", listReconciliations);

/**
 * @swagger
 * /api/reconciliation/alerts:
 *   get:
 *     summary: List reconciliation alerts
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
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
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [all, low, medium, high, critical]
 *       - in: query
 *         name: acknowledged
 *         schema:
 *           type: string
 *           enum: [true, false]
 *     responses:
 *       200:
 *         description: List of reconciliation alerts
 */
router.get("/alerts", listAlerts);

/**
 * @swagger
 * /api/reconciliation/alerts/{alert_id}/acknowledge:
 *   post:
 *     summary: Acknowledge a reconciliation alert
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alert_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert acknowledged
 *       404:
 *         description: Alert not found
 */
router.post("/alerts/:alert_id/acknowledge", acknowledgeAlert);

/**
 * @swagger
 * /api/reconciliation/{reconciliation_id}:
 *   get:
 *     summary: Get reconciliation details
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reconciliation_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reconciliation details
 *       404:
 *         description: Reconciliation not found
 */
router.get("/:reconciliation_id", getReconciliationDetails);

/**
 * @swagger
 * /api/reconciliation/{reconciliation_id}/review:
 *   post:
 *     summary: Mark reconciliation as reviewed
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reconciliation_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reconciliation reviewed
 */
router.post("/:reconciliation_id/review", reviewReconciliation);

export default router;
