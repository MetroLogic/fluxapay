import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import {
    createInvoice,
    getInvoiceById,
    listInvoices,
    updateInvoiceStatus,
    exportInvoice,
} from "../controllers/invoice.controller";
import {
    createInvoiceSchema,
    listInvoicesQuerySchema,
    getInvoiceByIdSchema,
    exportInvoiceSchema,
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
router.patch("/:invoice_id/status", authenticateApiKey, updateInvoiceStatus);

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

export default router;
