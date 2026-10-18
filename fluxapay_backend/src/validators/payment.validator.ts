import { body } from 'express-validator';
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { apiError, sendApiError } from '../helpers/apiError.helper';
import { ErrorCode } from '../types/errors';

const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendApiError(
      res,
      apiError(400, ErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: errors.array(),
      }),
    );
  }
  next();
};

export const validateUpdatePayment = [
  body('note')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('note must be a string with a maximum of 500 characters'),
  validate,
];
