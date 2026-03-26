import { Router } from 'express';
import { createPayment } from '../controllers/payment.controller';
import { validatePayment } from '../validators/payment.validator';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/payments:
 *   post:
 *     summary: Create payment intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       201:
 *         description: Payment created
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', authenticateToken, validatePayment, createPayment);

export default router;
