import { Router } from "express";
import {
    createPayment,
    getPayments,
    getPaymentById
} from "../controllers/payment.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";

const router = Router();

/**
 * @swagger
 * /api/payments:
 *   post:
 *     summary: Create a new payment request
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Payment request created
 */
router.post("/", authenticateToken, idempotencyMiddleware, createPayment);

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: Get all payments for the logged-in merchant
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payments
 */
router.get("/", authenticateToken, getPayments);

/**
 * @swagger
 * /api/payments/export:
 *   get:
 *     summary: Export payments history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file
 */
router.get("/export", authenticateToken, getPayments);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get payment details by ID
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment found
 */
router.get("/:id", authenticateToken, getPaymentById);

export default router;
