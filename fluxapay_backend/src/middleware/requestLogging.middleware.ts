import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../utils/logger';
import { getMetricsCollector } from '../utils/logger';
import { AuthRequest } from '../types/express';

/**
 * Request Logging Middleware
 * 
 * Logs structured JSON for each HTTP request with:
 * - Request ID for tracing
 * - HTTP method and path
 * - Response status code
 * - Response time
 * - User/merchant context (if available)
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime();
  const requestLogger = getLogger().child({
    requestId: (req as AuthRequest).requestId,
    method: req.method,
    path: req.originalUrl,
  });

  // Track request start for metrics
  const metricsCollector = getMetricsCollector();
  metricsCollector.increment('http_requests_total', {
    method: req.method,
    path: normalizePath(req.originalUrl),
  });

  // Capture response finish event
  res.on('finish', () => {
    const duration = calculateDuration(startTime);
    
    // Log the request
    requestLogger.info('HTTP Request', {
      statusCode: res.statusCode,
      responseTime: duration,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    // Record response time metric
    metricsCollector.timer('http_request_duration_ms', startTime, {
      method: req.method,
      path: normalizePath(req.originalUrl),
      status: res.statusCode.toString(),
    });

    // Track error responses
    if (res.statusCode >= 400) {
      metricsCollector.increment('http_errors_total', {
        method: req.method,
        path: normalizePath(req.originalUrl),
        status: res.statusCode.toString(),
      });
    }

    // Track slow requests
    if (duration > 1000) {
      metricsCollector.increment('http_slow_requests_total', {
        method: req.method,
        path: normalizePath(req.originalUrl),
        threshold: '1000ms',
      });
      
      requestLogger.warn('Slow request detected', {
        responseTime: duration,
        threshold: 1000,
      });
    }
  });

  next();
}

/**
 * Error Logging Middleware
 * 
 * Logs errors with full context and stack traces.
 * Should be used as the last middleware in the chain.
 */
export function errorLoggingMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const logger = getLogger().child({
    requestId: (req as AuthRequest).requestId,
    method: req.method,
    path: req.originalUrl,
  });

  const metricsCollector = getMetricsCollector();
  
  // Log the error with full details
  logger.error('Request error', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
  });

  // Track error in metrics
  metricsCollector.increment('application_errors_total', {
    error_type: err.name,
    path: normalizePath(req.originalUrl),
  });

  // Pass to next error handler
  next(err);
}

/**
 * Calculate duration in milliseconds from hrtime
 */
function calculateDuration(startTime: [number, number]): number {
  const endTime = process.hrtime(startTime);
  return endTime[0] * 1000 + endTime[1] / 1000000;
}

/**
 * Normalize path to remove dynamic parameters for metrics
 * This prevents metric cardinality explosion
 */
function normalizePath(path: string): string {
  // Remove query parameters
  const basePath = path.split('?')[0];
  
  // Replace UUIDs with placeholder
  const normalized = basePath.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
  
  // Replace numeric IDs with placeholder
  return normalized.replace(/\/\d+/g, '/:id');
}
