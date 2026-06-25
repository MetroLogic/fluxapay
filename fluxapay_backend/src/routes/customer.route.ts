import { Router } from "express";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { merchantApiKeyRateLimit } from "../middleware/rateLimit.middleware";
import { validate, validateQuery } from "../middleware/validation.middleware";
import {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} from "../controllers/customer.controller";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  customerIdParamsSchema,
  updateCustomerSchema,
} from "../schemas/customer.schema";

const router = Router();

/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Create a customer
 *     tags: [Customers]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               stellar_address:
 *                 type: string
 *               metadata:
 *                 type: object
 *                 maxProperties: 10
 *     responses:
 *       201:
 *         description: Customer created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Customer with this email already exists
 *   get:
 *     summary: List customers for the authenticated merchant
 *     tags: [Customers]
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
 *         name: search
 *         schema: { type: string }
 *         description: Filter by email (case-insensitive contains)
 *       - in: query
 *         name: created_after
 *         schema: { type: string, format: date-time }
 *         description: Filter customers created after this date
 *       - in: query
 *         name: created_before
 *         schema: { type: string, format: date-time }
 *         description: Filter customers created before this date
 *     responses:
 *       200:
 *         description: Paginated customers
 */
router.post("/", authenticateApiKey, merchantApiKeyRateLimit(), validate(createCustomerSchema), createCustomer);
router.get(
  "/",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validateQuery(listCustomersQuerySchema),
  listCustomers,
);

/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Get a customer by ID
 *     tags: [Customers]
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
 *         description: Customer found
 *       404:
 *         description: Not found
 *   patch:
 *     summary: Update a customer
 *     tags: [Customers]
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
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               stellar_address:
 *                 type: string
 *               metadata:
 *                 type: object
 *                 maxProperties: 10
 *     responses:
 *       200:
 *         description: Customer updated
 *       404:
 *         description: Not found
 *       409:
 *         description: Customer with this email already exists
 *   delete:
 *     summary: Delete a customer
 *     tags: [Customers]
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
 *         description: Customer soft-deleted with GDPR anonymization
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validate(customerIdParamsSchema),
  getCustomerById,
);
router.patch(
  "/:id",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validate(updateCustomerSchema),
  updateCustomer,
);
router.delete(
  "/:id",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validate(customerIdParamsSchema),
  deleteCustomer,
);

export default router;
