import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import {
  discrepancyAlertsQuerySchema,
  reconciliationSummaryQuerySchema,
  resolveAlertSchema,
  upsertThresholdSchema,
} from "../schemas/reconciliation.schema";
import {
  getReconciliationSummary,
  listDiscrepancyAlerts,
  resolveDiscrepancyAlert,
  upsertDiscrepancyThreshold,
} from "../controllers/reconciliation.controller";

const router = Router();

router.use(authenticateToken);

/**
 * @swagger
 * /api/admin/reconciliation/summary:
 *   get:
 *     summary: Get reconciliation period summary and detect discrepancies
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: merchant_id
 *         schema:
 *           type: string
 *         description: Optional merchant filter
 *       - in: query
 *         name: period_start
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: period_end
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Reconciliation summary generated
 */
router.get("/summary", validateQuery(reconciliationSummaryQuerySchema), getReconciliationSummary);

/**
 * @swagger
 * /api/admin/reconciliation/alerts:
 *   get:
 *     summary: List discrepancy alerts for admin UI
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: merchant_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_resolved
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Discrepancy alerts retrieved
 */
router.get("/alerts", validateQuery(discrepancyAlertsQuerySchema), listDiscrepancyAlerts);

/**
 * @swagger
 * /api/admin/reconciliation/alerts/{alert_id}/resolve:
 *   patch:
 *     summary: Resolve or reopen discrepancy alert
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alert_id
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
 *               is_resolved:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Alert state updated
 */
router.patch("/alerts/:alert_id/resolve", validate(resolveAlertSchema), resolveDiscrepancyAlert);

/**
 * @swagger
 * /api/admin/reconciliation/thresholds:
 *   post:
 *     summary: Create or update discrepancy threshold configuration
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpsertDiscrepancyThresholdRequest'
 *     responses:
 *       200:
 *         description: Threshold saved
 */
router.post("/thresholds", validate(upsertThresholdSchema), upsertDiscrepancyThreshold);

export default router;
