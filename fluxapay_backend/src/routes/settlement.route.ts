import { Router } from "express";
import {
    listSettlements,
    getSettlementDetails,
    getSettlementSummary,
    exportSettlement,
} from "../controllers/settlement.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import * as settlementSchema from "../schemas/settlement.schema";

const router = Router();

router.use(authenticateToken);

/**
 * @swagger
 * /api/settlements:
 *   get:
 *     summary: List settlements
 *     tags: [Settlements]
 *     security:
 *       - bearerAuth: []
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
 * /api/settlements/summary:
 *   get:
 *     summary: Get settlement summary
 *     tags: [Settlements]
 *     security:
 *       - bearerAuth: []
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
 * /api/settlements/{settlement_id}:
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
 * /api/settlements/{settlement_id}/export:
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
