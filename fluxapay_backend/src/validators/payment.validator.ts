import { body } from 'express-validator';
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import {
  DEFAULT_METADATA_MAX_BYTES,
  DEFAULT_METADATA_MAX_DEPTH,
} from '../utils/metadata.util';

const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

const getLimit = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const hasDepthBeyondLimit = (
  value: unknown,
  maxDepth: number,
  depth = 1,
): boolean => {
  if (depth > maxDepth) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasDepthBeyondLimit(item, maxDepth, depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((nestedValue) =>
      hasDepthBeyondLimit(nestedValue, maxDepth, depth + 1),
    );
  }

  return false;
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
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
    .custom((value) => {
      const maxBytes = getLimit(process.env.PAYMENT_METADATA_MAX_BYTES, DEFAULT_METADATA_MAX_BYTES);
      const maxDepth = getLimit(process.env.PAYMENT_METADATA_MAX_DEPTH, DEFAULT_METADATA_MAX_DEPTH);

      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error('Metadata must be valid JSON');
      }

      const sizeBytes = Buffer.byteLength(serialized, 'utf8');
      if (sizeBytes > maxBytes) {
        throw new Error(`Metadata exceeds maximum size of ${maxBytes} bytes`);
      }

      if (hasDepthBeyondLimit(value, maxDepth)) {
        throw new Error(`Metadata depth exceeds maximum of ${maxDepth}`);
      }

      return true;
    }),
  body('customer_id').optional().isString().trim().notEmpty().withMessage('customer_id must be a non-empty string'),
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
