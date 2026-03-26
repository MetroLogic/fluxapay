/**
 * settlementBatch.route.ts
 *
 * Internal / admin routes for the settlement batch engine.
 * These endpoints are protected by an internal admin secret (X-Admin-Secret header),
 * NOT by merchant JWT –– they are operations run by FluxaPay operators.
 *
 * Routes:
 *   POST /api/admin/settlement/run      – Manually trigger a settlement batch run
 *   GET  /api/admin/settlement/status   – Quick health check of the settlement system
 */

import { Router, Request, Response } from "express";
import { runSettlementBatch } from "../services/settlementBatch.service";
import { adminAuth } from "../middleware/adminAuth.middleware";

const router = Router();

/**
 * @swagger
 * /api/admin/settlement/run:
 *   post:
 *     summary: Manually trigger a settlement batch run
 *     tags: [Admin - Settlement]
 *     security:
 *       - adminSecret: []
 *     responses:
 *       200:
 *         description: Batch run completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batchId:
 *                   type: string
 *                 totalMerchantsProcessed:
 *                   type: integer
 *                 totalMerchantsSucceeded:
 *                   type: integer
 *                 totalMerchantsFailed:
 *                   type: integer
 *                 durationMs:
 *                   type: integer
 *       500:
 *         description: Batch run failed with unhandled error
 */
router.post("/run", adminAuth, async (_req: Request, res: Response) => {
    try {
        const result = await runSettlementBatch();
        const durationMs = result.completedAt.getTime() - result.startedAt.getTime();
        res.status(200).json({
            message: "Settlement batch completed",
            batchId: result.batchId,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
            durationMs,
            totalMerchantsProcessed: result.totalMerchantsProcessed,
            totalMerchantsSucceeded: result.totalMerchantsSucceeded,
            totalMerchantsFailed: result.totalMerchantsFailed,
            merchantResults: result.merchantResults,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[SettlementBatch Route] Unhandled error:", msg);
        res.status(500).json({ message: "Settlement batch failed", error: msg });
    }
});

/**
 * @swagger
 * /api/admin/settlement/status:
 *   get:
 *     summary: Settlement system status
 *     tags: [Admin - Settlement]
 *     security:
 *       - adminSecret: []
 *     responses:
 *       200:
 *         description: System status
 */
router.get("/status", adminAuth, async (_req: Request, res: Response) => {
    const { PrismaClient } = await import("../generated/client/client");
    const prisma = new PrismaClient();

    try {
        const [unsettledCount, pendingSettlements, recentBatches] = await Promise.all([
            // Payments swept but not yet settled
            prisma.payment.count({ where: { swept: true, settled: false } }),
            // Settlements in pending/processing state
            prisma.settlement.count({ where: { status: { in: ["pending", "processing"] } } }),
            // Last 5 settlement batches
            prisma.settlement.findMany({
                orderBy: { created_at: "desc" },
                take: 5,
                select: {
                    id: true,
                    merchantId: true,
                    currency: true,
                    usdc_amount: true,
                    net_amount: true,
                    status: true,
                    processed_date: true,
                    created_at: true,
                },
            }),
        ]);

        res.json({
            status: "ok",
            unsettled_payment_count: unsettledCount,
            pending_settlement_count: pendingSettlements,
            exchange_partner: process.env.EXCHANGE_PARTNER ?? "mock",
            settlement_fee_percent: parseFloat(process.env.SETTLEMENT_FEE_PERCENT ?? "2"),
            cron_schedule: process.env.SETTLEMENT_CRON ?? "0 0 * * *",
            recent_batches: recentBatches,
        });
    } finally {
        await prisma.$disconnect();
    }
});

export default router;
