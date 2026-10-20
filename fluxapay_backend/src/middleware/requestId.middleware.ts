import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthRequest } from "../types/express";
import { requestContextStorage } from "../utils/requestContext";
import { loggerStorage } from "../utils/logger";

/**
 * Request ID Middleware
 *
 * Adds request and correlation IDs for tracing and debugging.
 * Uses an incoming x-correlation-id, then legacy x-request-id, or generates a UUID.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingRequestId = req.headers["x-request-id"];
  const incomingCorrelationId = req.headers["x-correlation-id"];
  const requestId = Array.isArray(incomingRequestId)
    ? incomingRequestId[0]
    : incomingRequestId;
  const correlationHeader = Array.isArray(incomingCorrelationId)
    ? incomingCorrelationId[0]
    : incomingCorrelationId;
  const correlationId = correlationHeader || requestId || randomUUID();
  const resolvedRequestId = requestId || correlationId;

  // Attach to request object for use in downstream middleware/handlers
  (req as AuthRequest).requestId = resolvedRequestId;
  (req as AuthRequest).correlationId = correlationId;

  // Add to response headers for client visibility
  res.setHeader("x-request-id", resolvedRequestId);
  res.setHeader("X-FluxaPay-Request-ID", resolvedRequestId);
  res.setHeader("X-Correlation-ID", correlationId);

  // Run the rest of the request within the async local storage context
  requestContextStorage.run({ requestId: resolvedRequestId, correlationId }, () => {
    // Run downstream middleware in the logger storage context
    loggerStorage.run({ requestId: resolvedRequestId, correlationId }, () => {
      next();
    });
  });
}
