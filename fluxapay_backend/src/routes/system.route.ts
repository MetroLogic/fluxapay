/**
 * Admin system status routes.
 */

import { Router, Request, Response } from "express";
import { adminAuth } from "../middleware/adminAuth.middleware";
import { getSystemStatus } from "../services/systemStatus.service";

const router = Router();

/**
 * @swagger
 * /api/v1/admin/system/status:
 *   get:
 *     summary: Admin system status
 *     tags: [Admin - System]
 *     security:
 *       - adminSecret: []
 *     responses:
 *       200:
 *         description: System status including SMS provider health
 */
router.get("/status", adminAuth, (_req: Request, res: Response) => {
  res.json(getSystemStatus());
});

export default router;
