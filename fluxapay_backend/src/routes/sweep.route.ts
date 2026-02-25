/**
 * sweep.route.ts
 *
 * Internal/admin endpoint for triggering sweep runs.
 * Protected by X-Admin-Secret (same as settlement batch).
 */

import { Router, Request, Response } from "express";
import { sweepService } from "../services/sweep.service";

const router = Router();

function requireAdminSecret(req: Request, res: Response, next: () => void) {
  const secret = process.env.ADMIN_INTERNAL_SECRET;
  const provided = req.headers["x-admin-secret"];

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      res.status(503).json({ message: "Admin endpoints are disabled in production when ADMIN_INTERNAL_SECRET is not set." });
      return;
    }
  } else if (provided !== secret) {
    res.status(401).json({ message: "Unauthorized. Invalid admin secret." });
    return;
  }

  next();
}

/**
 * POST /api/admin/sweep/run
 * Optional JSON body: { limit?: number, dry_run?: boolean }
 */
router.post("/run", requireAdminSecret, async (req: Request, res: Response) => {
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
