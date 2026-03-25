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

/**
 * Invoice routes support dual authentication:
 * - JWT tokens (from dashboard): Authorization: Bearer <jwt_token>
 * - API keys (from server integrations): x-api-key: <sk_live_...> or Authorization: Bearer <sk_live_...>
 * 
 * The authenticateApiKey middleware handles both methods and sets req.merchantId
 */
router.use(authenticateApiKey);

/**
 * @swagger
 * /api/invoices:
 *   post:
 *     summary: Create a new invoice
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_name
 *               - customer_email
 *               - line_items
 *               - currency
 *               - due_date
 *             properties:
 *               customer_name:
 *                 type: string
 *               customer_email:
 *                 type: string
 *               line_items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unit_price:
 *                       type: number
 *               currency:
 *                 type: string
 *               due_date:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Invoice created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized - invalid JWT or API key
 */
router.post("/", validateInvoice, createInvoice);

/**
 * @swagger
 * /api/invoices:
 *   get:
 *     summary: List invoices
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [unpaid, paid, overdue, cancelled]
 *         description: Filter by invoice status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by invoice number, customer name, or email
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of invoices
 *       401:
 *         description: Unauthorized - invalid JWT or API key
 */
router.get("/", getInvoices);

/**
 * @swagger
 * /api/invoices/{id}:
 *   get:
 *     summary: Get a single invoice
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     responses:
 *       200:
 *         description: Invoice details
 *       401:
 *         description: Unauthorized - invalid JWT or API key
 *       404:
 *         description: Invoice not found
 */
router.get("/:id", getInvoiceById);

/**
 * @swagger
 * /api/invoices/{id}/status:
 *   patch:
 *     summary: Update invoice status
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [unpaid, paid, overdue, cancelled]
 *     responses:
 *       200:
 *         description: Invoice status updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized - invalid JWT or API key
 *       404:
 *         description: Invoice not found
 */
router.patch("/:id/status", validateStatusUpdate, updateInvoiceStatus);

export default router;
