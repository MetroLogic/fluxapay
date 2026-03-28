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

/** Validates that a URL is an absolute https:// URL */
const isHttpsUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      throw new Error('URL must use https');
    }
    return true;
  } catch {
    throw new Error('Must be a valid https URL');
  }
};

export const validatePayment = [
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('currency').equals('USDC').withMessage('Only USDC is supported'),
  body('customer_email').isEmail().withMessage('Invalid customer email'),
  body('description').optional().isString().trim().withMessage('description must be a string'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  body('success_url')
    .optional()
    .isString()
    .custom(isHttpsUrl)
    .withMessage('success_url must be a valid https URL'),
  body('cancel_url')
    .optional()
    .isString()
    .custom(isHttpsUrl)
    .withMessage('cancel_url must be a valid https URL'),
  validate,
];
