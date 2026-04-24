import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { createInvoice, listInvoices, exportInvoice, updateInvoiceStatus } from "../controllers/invoice.controller";
import { createInvoiceSchema, listInvoicesQuerySchema, exportInvoiceSchema, updateInvoiceStatusSchema } from "../schemas/invoice.schema";

const router = Router();

/**
 * @swagger
 * /api/v1/invoices:
 *   post:
 *     summary: Create invoice and payment intent
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateInvoiceRequest'
 *     responses:
 *       201:
 *         description: Invoice created
 *       400:
 *         description: Validation error
 *   get:
 *     summary: List merchant invoices
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, paid, cancelled, overdue]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search invoice number or customer email
 *     responses:
 *       200:
 *         description: Invoices retrieved
 */
router.post("/", authenticateApiKey, merchantApiKeyRateLimit(), validate(createInvoiceSchema), createInvoice);
router.get("/", authenticateApiKey, merchantApiKeyRateLimit(), validateQuery(listInvoicesQuerySchema), listInvoices);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/status:
 *   patch:
 *     summary: Update invoice status
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, paid, cancelled, overdue]
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Invoice not found
 */
router.patch("/:invoice_id/status", authenticateApiKey, validate(updateInvoiceStatusSchema), updateInvoiceStatus);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/export:
 *   get:
 *     summary: Export invoice in CSV or JSON format
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: json
 *     responses:
 *       200:
 *         description: Invoice exported
 *       404:
 *         description: Invoice not found
 */
router.get("/:invoice_id/export", authenticateApiKey, merchantApiKeyRateLimit(), validate(exportInvoiceSchema), exportInvoice);

export default router;
