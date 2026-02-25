import { Router } from "express";
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoiceStatus,
} from "../controllers/invoice.controller";
import { validateInvoice, validateStatusUpdate } from "../validators/invoice.validator";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";

const router = Router();

// Apply authentication to all invoice routes
router.use(authenticateApiKey);

// POST /api/invoices — create a new invoice
router.post("/", validateInvoice, createInvoice);

// GET /api/invoices — list invoices (supports ?status=&search=&page=&limit=)
router.get("/", getInvoices);

// GET /api/invoices/:id — get single invoice
router.get("/:id", getInvoiceById);

// PATCH /api/invoices/:id/status — update invoice status
router.patch("/:id/status", validateStatusUpdate, updateInvoiceStatus);

export default router;
