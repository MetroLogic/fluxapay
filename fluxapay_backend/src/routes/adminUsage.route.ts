import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth.middleware";
import { authenticateAdmin, requireAdminRole, AdminPermission } from "../middleware/adminRbac.middleware";
import { adminQueryUsageHandler } from "../controllers/usage.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/admin/usage:
 *   get:
 *     summary: Query merchant usage for billing (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: merchant_id
 *         description: Filter results to a single merchant ID.
 *         schema: { type: string }
 *       - in: query
 *         name: over_limit
 *         description: When true, only return merchants that exceeded their plan limits.
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         description: Page number to return (1-indexed).
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         description: Maximum number of items to return per page.
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Usage records
 */
router.get(
  "/",
  authenticateAdmin,
  adminAuth,
  requireAdminRole(AdminPermission.MERCHANTS_READ),
  adminQueryUsageHandler,
);

export default router;
