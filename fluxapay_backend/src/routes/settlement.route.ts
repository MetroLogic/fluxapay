import { Router } from "express";
import {
    listSettlements,
    getSettlementDetails,
    getSettlementSummary,
    exportSettlement,
    getSettlementBatch,
} from "../controllers/settlement.controller";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { validate } from "../middleware/validation.middleware";
import * as settlementSchema from "../schemas/settlement.schema";

const router = Router();

router.use(authenticateApiKey);

/**
 * @swagger
 * /api/v1/settlements:
 *   get:
 *     summary: List settlements
 *     tags: [Settlements]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
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
 *         description: List of settlements
 */
router.get("/", validate(settlementSchema.listSettlementsSchema), listSettlements);

/**
 * @swagger
 * /api/v1/settlements/summary:
 *   get:
 *     summary: Get settlement summary
 *     tags: [Settlements]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Settlement summary stats
 */
router.get("/summary", validate(settlementSchema.settlementSummarySchema), getSettlementSummary);

/**
 * @swagger
 * /api/v1/settlements/batch:
 *   get:
 *     summary: Get settlement batch summary by scheduled date
 *     tags: [Settlements]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
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
 *         description: Settlement batches returned
 */
router.get("/batch", validate(settlementSchema.settlementBatchSchema), getSettlementBatch);

/**
 * @swagger
 * /api/v1/settlements/{settlement_id}:
 *   get:
 *     summary: Get settlement details
 *     tags: [Settlements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: settlement_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Settlement details
 *       404:
 *         description: Settlement not found
 */
router.get("/:settlement_id", validate(settlementSchema.settlementDetailsSchema), getSettlementDetails);

/**
 * @swagger
 * /api/v1/settlements/{settlement_id}/export:
 *   get:
 *     summary: Export settlement report
 *     tags: [Settlements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: settlement_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, csv]
 *           default: pdf
 *     responses:
 *       200:
 *         description: Settlement report
 *       404:
 *         description: Settlement not found
 */
router.get("/:settlement_id/export", validate(settlementSchema.exportSettlementSchema), exportSettlement);

export default router;
