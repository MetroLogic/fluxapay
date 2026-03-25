/**
 * sweep.route.ts
 *
 * Internal/admin endpoint for triggering sweep runs.
 * Protected by X-Admin-Secret (same as settlement batch).
 */

import { Router, Request, Response } from "express";
import { sweepService } from "../services/sweep.service";
import { adminAuth } from "../middleware/adminAuth.middleware";

const router = Router();

/**
 * @swagger
 * /api/admin/sweep/run:
 *   post:
 *     summary: Manually trigger a sweep of paid payments
 *     tags: [Admin - Sweep]
 *     security:
 *       - adminSecret: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: integer
 *               dry_run:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Sweep completed
 *       401:
 *         description: Unauthorized - missing or invalid admin secret
 *       500:
 *         description: Sweep failed
 */
router.post("/run", adminAuth, async (req: Request, res: Response) => {
  try {
    const limit = req.body?.limit;
    const dryRun = req.body?.dry_run === true;

    const result = await sweepService.sweepPaidPayments({
      adminId: "system",
      limit: typeof limit === "number" ? limit : undefined,
      dryRun,
    });

    res.status(200).json({
      message: dryRun ? "Sweep dry-run complete" : "Sweep complete",
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: "Sweep failed", error: msg });
  }
});

export default router;
