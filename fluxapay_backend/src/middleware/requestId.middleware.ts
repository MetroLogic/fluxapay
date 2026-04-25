import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthRequest } from "../types/express";

/**
 * Request ID Middleware
 *
 * Adds a unique request ID to each request for tracing and debugging.
 * Uses x-request-id header if provided, otherwise generates a new UUID.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();

  // Attach to request object for use in downstream middleware/handlers
  (req as AuthRequest).requestId = requestId;

  // Add to response headers for client visibility
  res.setHeader("x-request-id", requestId);

  next();
}
