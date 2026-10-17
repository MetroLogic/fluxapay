import { Request, Response, NextFunction } from "express";
import { query, validationResult } from "express-validator";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

/**
 * Validates common pagination query parameters: page, limit, order.
 */
export const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("order")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("order must be 'asc' or 'desc'"),
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendApiError(
        res,
        apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid pagination parameters", {
          errors: errors.array(),
        }),
      );
      return;
    }
    next();
  },
];
