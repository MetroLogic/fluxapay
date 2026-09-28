import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { createInvoice, listInvoices, getInvoiceById, updateInvoiceStatus, exportInvoice, getInvoiceExportStatus, downloadInvoiceExport, sendInvoice, voidInvoice } from "../controllers/invoice.controller";
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  getInvoiceByIdSchema,
  exportInvoiceSchema,
  updateInvoiceStatusSchema,
} from "../schemas/invoice.schema";

const router = Router();

/**
 * @swagger
 * /api/v1/invoices:
 *   post:
 *     summary: Create invoice and linked payment intent
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, currency, customer_email]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 150.00
 *               currency:
 *                 type: string
 *                 example: USDC
 *               customer_email:
 *                 type: string
 *                 format: email
 *                 example: customer@example.com
 *               due_date:
 *                 type: string
 *                 format: date-time
 *                 description: ISO 8601 datetime. Invoices past this date are automatically marked overdue.
 *                 example: "2026-05-31T23:59:59Z"
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       201:
 *         description: Invoice and payment intent created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
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
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
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
 *         description: Paginated list of invoices
 */
router.post("/", authenticateApiKey, merchantApiKeyRateLimit(), validate(createInvoiceSchema), createInvoice);
router.get("/", authenticateApiKey, merchantApiKeyRateLimit(), validateQuery(listInvoicesQuerySchema), listInvoices);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}:
 *   get:
 *     summary: Get invoice by ID
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice retrieved including linked payment
 *       404:
 *         description: Invoice not found
 */
router.get("/:invoice_id", authenticateApiKey, validate(getInvoiceByIdSchema), getInvoiceById);

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
 *         description: Invoice status updated
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Invoice not found
 */
router.patch("/:invoice_id/status", authenticateApiKey, validate(updateInvoiceStatusSchema), updateInvoiceStatus);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/send:
 *   post:
 *     summary: Send invoice to customer via email
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice sent successfully
 *       400:
 *         description: Invoice not in draft status
 *       404:
 *         description: Invoice not found
 */
router.post("/:invoice_id/send", authenticateApiKey, merchantApiKeyRateLimit(), validate(getInvoiceByIdSchema), sendInvoice);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/void:
 *   post:
 *     summary: Void an unpaid invoice
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice voided successfully
 *       400:
 *         description: Invoice already voided
 *       404:
 *         description: Invoice not found
 *       422:
 *         description: Cannot void a paid invoice
 */
router.post("/:invoice_id/void", authenticateApiKey, merchantApiKeyRateLimit(), validate(getInvoiceByIdSchema), voidInvoice);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/export:
 *   get:
 *     summary: Export invoice as PDF, CSV, or JSON
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
 *           enum: [pdf, csv, json]
 *           default: pdf
 *         description: Export format. "pdf" returns a binary PDF stream.
 *     responses:
 *       200:
 *         description: Invoice file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Invoice not found
 */
router.get("/:invoice_id/export", authenticateApiKey, merchantApiKeyRateLimit(), validate(exportInvoiceSchema), exportInvoice);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/export:
 *   post:
 *     summary: Start an async invoice export job
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
 *           enum: [pdf, csv, json]
 *           default: pdf
 *     responses:
 *       202:
 *         description: Export job accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Invoice not found
 */
router.post("/:invoice_id/export", authenticateApiKey, merchantApiKeyRateLimit(), validate(exportInvoiceSchema), exportInvoice);

/**
 * @swagger
 * /api/v1/invoices/exports/{jobId}:
 *   get:
 *     summary: Get invoice export job status by job id
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Export job status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Export job not found
 */
router.get("/exports/:jobId", authenticateApiKey, merchantApiKeyRateLimit(), getInvoiceExportStatus);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/export/{jobId}/status:
 *   get:
 *     summary: Get async invoice export job status
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Export job status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Invoice or export job not found
 */
router.get("/:invoice_id/export/:jobId/status", authenticateApiKey, merchantApiKeyRateLimit(), validate(getInvoiceByIdSchema), getInvoiceExportStatus);

/**
 * @swagger
 * /api/v1/invoices/{invoice_id}/export/{jobId}/download:
 *   get:
 *     summary: Download a completed async invoice export
 *     tags: [Invoices]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Export file download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Invoice or export job not found
 */
router.get("/:invoice_id/export/:jobId/download", authenticateApiKey, merchantApiKeyRateLimit(), validate(getInvoiceByIdSchema), downloadInvoiceExport);

export default router;

