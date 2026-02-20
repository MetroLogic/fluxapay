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
  body('metadata').isObject().withMessage('Metadata must be an object'),
  validate,
];
