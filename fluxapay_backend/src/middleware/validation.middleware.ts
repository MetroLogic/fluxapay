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

      return res.status(400).json({ message: "Validation failed", errors });
    }

    const parsed = result.data as any;
    req.body = parsed;
    if (parsed?.params) {
      req.params = parsed.params;
    }
    if (parsed?.query) {
      req.query = parsed.query;
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

      return res.status(400).json({ message: "Validation failed", errors });
    }

    req.query = result.data as any; // parsed and safe data
    next();
  };
}
