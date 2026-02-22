import { Router } from 'express';
import { createPayment, getPayments, getPaymentById } from '../controllers/payment.controller';
import { validatePayment } from '../validators/payment.validator'; // Ensure this file exists

const router = Router();

// Endpoint: POST /api/payments/v1/payments
router.post('/v1/payments', validatePayment, createPayment);

// Endpoint: GET /api/payments/
router.get('/', getPayments);

// Endpoint: GET /api/payments/export
router.get('/export', getPayments);

// Endpoint: GET /api/payments/:payment_id
router.get('/:payment_id', getPaymentById);

export default router;