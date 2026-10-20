import { Request, Response, NextFunction } from "express";
import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";

/**
 * Validate `?page` and `?limit` query parameters for list endpoints.
 *
 * Both are optional. When present they must be positive integers; anything else
 * is rejected up front with a 400 so a malformed value can never reach the
 * database layer. The controller keeps its own clamping/fallback as defence in
 * depth, so valid-but-large limits are left for it to cap.
 */
export function validatePagination(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  for (const name of ["page", "limit"] as const) {
    const raw = req.query[name];
    if (raw === undefined || raw === null || raw === "") continue;

    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      return sendApiError(
        res,
        apiError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `\`${name}\` must be a positive integer`,
          { errors: [{ field: name, message: "must be a positive integer" }] },
        ),
      );
    }
  }

  return next();
}
