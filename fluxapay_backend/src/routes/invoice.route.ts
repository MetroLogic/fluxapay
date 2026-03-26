import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { createInvoice, listInvoices } from "../controllers/invoice.controller";
import { createInvoiceSchema, listInvoicesQuerySchema } from "../schemas/invoice.schema";

const router = Router();

/**
 * @swagger
 * /api/invoices:
 *   post:
 *     summary: Create invoice and payment intent
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
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
 *       - bearerAuth: []
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
 *     responses:
 *       200:
 *         description: Invoices retrieved
 */
router.post("/", authenticateToken, validate(createInvoiceSchema), createInvoice);
router.get("/", authenticateToken, validateQuery(listInvoicesQuerySchema), listInvoices);

export default router;
