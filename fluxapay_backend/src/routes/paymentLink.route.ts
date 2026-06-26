import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import {
  createPaymentLink,
  listPaymentLinks,
  getPaymentLinkById,
  updatePaymentLink,
  deletePaymentLink,
} from "../controllers/paymentLink.controller";
import {
  createPaymentLinkSchema,
  listPaymentLinksQuerySchema,
  paymentLinkParamsSchema,
  updatePaymentLinkSchema,
} from "../schemas/paymentLink.schema";

const router = Router();

/**
 * @swagger
 * /api/v1/payment-links:
 *   post:
 *     summary: Create a payment link
 *     tags: [Payment Links]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, currency]
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Consultation Fee"
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 example: "1-hour consultation session"
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 100.00
 *                 description: Optional for open-amount links
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *                 example: "USD"
 *               redirect_url:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/success"
 *               expiry:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-12-31T23:59:59Z"
 *               metadata:
 *                 type: object
 *                 maxProperties: 10
 *                 additionalProperties: true
 *               customer_id:
 *                 type: string
 *                 example: "cust_123abc"
 *     responses:
 *       201:
 *         description: Payment link created
 *       400:
 *         description: Validation error
 *   get:
 *     summary: List payment links
 *     tags: [Payment Links]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: active
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated payment links
 */
router.post("/", authenticateApiKey, merchantApiKeyRateLimit(), validate(createPaymentLinkSchema), createPaymentLink);
router.get("/", authenticateApiKey, merchantApiKeyRateLimit(), validateQuery(listPaymentLinksQuerySchema), listPaymentLinks);

/**
 * @swagger
 * /api/v1/payment-links/{id}:
 *   get:
 *     summary: Get a payment link by ID
 *     tags: [Payment Links]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment link found
 *       404:
 *         description: Not found
 *   patch:
 *     summary: Update a payment link
 *     tags: [Payment Links]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               redirect_url:
 *                 type: string
 *                 format: uri
 *               active:
 *                 type: boolean
 *               metadata:
 *                 type: object
 *                 maxProperties: 10
 *     responses:
 *       200:
 *         description: Payment link updated
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Deactivate a payment link
 *     tags: [Payment Links]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Payment link deactivated
 *       404:
 *         description: Not found
 */
router.get("/:id", authenticateApiKey, merchantApiKeyRateLimit(), validate(paymentLinkParamsSchema), getPaymentLinkById);
router.patch("/:id", authenticateApiKey, merchantApiKeyRateLimit(), validate(updatePaymentLinkSchema), updatePaymentLink);
router.delete("/:id", authenticateApiKey, merchantApiKeyRateLimit(), validate(paymentLinkParamsSchema), deletePaymentLink);

export default router;
