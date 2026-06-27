import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import {
  getAdminConfigHandler,
  patchAdminConfigHandler,
} from "../controllers/adminConfig.controller";

const router = Router();

router.use(authenticateToken);
router.use(adminAuth);

/**
 * @swagger
 * /api/v1/admin/config:
 *   get:
 *     summary: Get admin system configuration
 *     tags: [Admin - Config]
 *   patch:
 *     summary: Update admin system configuration (audited)
 *     tags: [Admin - Config]
 */
router.get("/", getAdminConfigHandler);
router.patch("/", patchAdminConfigHandler);

export default router;
