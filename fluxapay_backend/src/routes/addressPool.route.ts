import { Router } from "express";
import { getAddressPoolStats } from "../controllers/addressPool.controller";
import { adminAuth } from "../middleware/adminAuth.middleware";

const router = Router();

/**
 * @swagger
 * /api/v1/admin/address-pool/stats:
 *   get:
 *     summary: Retrieve address pool statistics
 *     tags: [Address Pool - Admin]
 *     security:
 *       - adminSecret: []
 *     responses:
 *       200:
 *         description: Address pool statistics
 *       401:
 *         description: Unauthorized
 */
router.get("/stats", adminAuth, getAddressPoolStats);

export default router;
