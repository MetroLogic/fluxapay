import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import {
  selfRequestDeletion,
  selfGetDeletionRequest,
  adminRequestDeletion,
  adminExecuteDeletion,
} from "../controllers/merchantDeletion.controller";

const router = Router();

// ── Merchant self-service ─────────────────────────────────────────────────────
router.post("/me/deletion-request", authenticateApiKey, selfRequestDeletion);
router.get("/me/deletion-request", authenticateApiKey, selfGetDeletionRequest);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post("/admin/:merchantId/deletion-request", authenticateToken, adminAuth, adminRequestDeletion);
router.post("/admin/:merchantId/anonymize", authenticateToken, adminAuth, adminExecuteDeletion);

export default router;
