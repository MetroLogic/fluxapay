import { Router } from 'express';
import { createPayment, getPayments, getPaymentById } from '../controllers/payment.controller';
import { validatePayment } from '../validators/payment.validator'; // Ensure this file exists
import { authenticateApiKey } from '../middleware/apiKeyAuth.middleware';

const router = Router();

// Apply authentication to all routes in this router
router.use(authenticateApiKey);

// Endpoint: POST /api/payments/v1/payments
router.post('/v1/payments', validatePayment, createPayment);

// Endpoint: GET /api/payments/
router.get('/', getPayments);

// Endpoint: GET /api/payments/export
router.get('/export', getPayments);

// Endpoint: GET /api/payments/v1/payments/:id
router.get('/v1/payments/:id', getPaymentById);

// Endpoint: GET /api/payments/:payment_id
router.get('/:payment_id', getPaymentById);

export default router;
