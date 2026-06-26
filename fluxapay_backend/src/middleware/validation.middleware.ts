import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

export function validate<T extends ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const payload = {
      ...(typeof req.body === "object" && req.body !== null ? req.body : {}),
      params: req.params,
      query: req.query,
    };

    const result = schema.safeParse(payload);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", { errors }));
    }

    const parsed = result.data as any;
    req.body = parsed;
    if (parsed?.params) {
      req.params = parsed.params;
    }
    if (parsed?.query) {
      Object.defineProperty(req, "query", {
        value: parsed.query,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  };
}

export function validateQuery<T extends ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", { errors }));
    }

    // Express 5 exposes `req.query` with a getter-only descriptor; replace it safely.
    Object.defineProperty(req, "query", {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}
