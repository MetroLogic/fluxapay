import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import {
  requestExport,
  getExportStatus,
  downloadExportHandler,
  adminRequestExport,
  adminDownloadExport,
} from "../controllers/dataExport.controller";

const router = Router();

router.post("/", authenticateApiKey, requestExport);
router.get("/:jobId", authenticateApiKey, getExportStatus);
router.get("/:jobId/download", authenticateApiKey, downloadExportHandler);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.post("/admin/:merchantId", authenticateToken, adminAuth, adminRequestExport);
router.get("/admin/:merchantId/:jobId/download", authenticateToken, adminAuth, adminDownloadExport);

export default router;
