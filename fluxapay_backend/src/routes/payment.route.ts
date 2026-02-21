import { Router } from 'express';
import { createPayment } from '../controllers/payment.controller';
import { validatePayment } from '../validators/payment.validator';

const router = Router();

router.post('/v1/payments', validatePayment, createPayment);

export default router;
