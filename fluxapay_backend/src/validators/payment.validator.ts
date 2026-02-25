import { body } from 'express-validator';
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const validatePayment = [
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('currency').equals('USDC').withMessage('Only USDC is supported'),
  body('customer_email').isEmail().withMessage('Invalid customer email'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  body('success_url').optional().isURL().withMessage('success_url must be a valid URL'),
  body('cancel_url').optional().isURL().withMessage('cancel_url must be a valid URL'),
  validate,
];
