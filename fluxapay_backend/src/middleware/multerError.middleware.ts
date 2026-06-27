import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

const MULTIPART_LIMIT = process.env.MULTIPART_FILE_SIZE_LIMIT ?? "10mb";
const MULTIPART_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * Converts Multer errors (e.g. LIMIT_FILE_SIZE) into structured HTTP 413 responses.
 * Register after multer upload middleware on routes that accept multipart uploads.
 */
export function multerErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendApiError(
        res,
        apiError(
          413,
          ErrorCode.FILE_TOO_LARGE,
          `Uploaded file exceeds the ${MULTIPART_LIMIT} limit.`,
          { details: { limit: MULTIPART_LIMIT, limit_bytes: MULTIPART_LIMIT_BYTES } },
        ),
      );
    }
    return sendApiError(
      res,
      apiError(400, ErrorCode.VALIDATION_ERROR, err.message),
    );
  }
  next(err);
}
