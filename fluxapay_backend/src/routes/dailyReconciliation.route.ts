import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import {
  generateDailyReconciliationReport,
  listDailyReconciliationReports,
  getDailyReconciliationReport,
  getDailyReconciliationReportCsv,
  emailDailyReconciliationReport,
} from "../controllers/dailyReconciliation.controller";
import { z } from "zod";

const generateReportSchema = z.object({
  body: z.object({
    date: z.string().datetime().optional(),
  }),
});

const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

const router = Router();

/**
 * @swagger
 * /api/v1/reports/reconciliation:
 *   post:
 *     summary: Generate daily reconciliation report
 *     tags: [Reconciliation Reports]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date-time
 *                 description: Report date (defaults to today)
 *     responses:
 *       201:
 *         description: Report generated
 *   get:
 *     summary: List daily reconciliation reports
 *     tags: [Reconciliation Reports]
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
 *         name: start_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Reports listed
 */
router.post("/", authenticateApiKey, merchantApiKeyRateLimit(), validate(generateReportSchema), generateDailyReconciliationReport);
router.get("/", authenticateApiKey, merchantApiKeyRateLimit(), validateQuery(listReportsQuerySchema), listDailyReconciliationReports);

/**
 * @swagger
 * /api/v1/reports/reconciliation/{date}:
 *   get:
 *     summary: Get daily reconciliation report for a specific date
 *     tags: [Reconciliation Reports]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Report retrieved
 *       404:
 *         description: Report not found
 */
router.get("/:date", authenticateApiKey, merchantApiKeyRateLimit(), getDailyReconciliationReport);

/**
 * @swagger
 * /api/v1/reports/reconciliation/{date}/csv:
 *   get:
 *     summary: Download reconciliation report as CSV
 *     tags: [Reconciliation Reports]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: Report not found
 */
router.get("/:date/csv", authenticateApiKey, merchantApiKeyRateLimit(), getDailyReconciliationReportCsv);

/**
 * @swagger
 * /api/v1/reports/reconciliation/{date}/email:
 *   post:
 *     summary: Email reconciliation report to merchant
 *     tags: [Reconciliation Reports]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Report emailed
 *       404:
 *         description: Report not found
 */
router.post("/:date/email", authenticateApiKey, merchantApiKeyRateLimit(), emailDailyReconciliationReport);

export default router;
