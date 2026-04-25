import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../utils/logger';
import { getMetricsCollector } from '../utils/logger';
import { AuthRequest } from '../types/express';
import { redactAuthHeader, hashMerchantId, sanitizeObject } from '../utils/piiRedactor';

/**
 * Request Logging Middleware
 * 
 * Logs structured JSON for each HTTP request with:
 * - Request ID for tracing
 * - HTTP method and path
 * - Response status code
 * - Response time
 * - User/merchant context (if available)
 * - PII-safe logging (redacted auth headers, hashed identifiers)
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime();
  const authReq = req as AuthRequest;
  
  // Prepare base context with PII-safe data
  const baseContext: any = {
    requestId: authReq.requestId,
    method: req.method,
    path: req.originalUrl,
  };
  
  // Add hashed merchantId if available (for correlation without PII leak)
  if (authReq.merchantId) {
    baseContext.merchantIdHash = hashMerchantId(authReq.merchantId);
  }
  
  // Add user info (email is already redacted in the token/user object)
  if (authReq.user?.email) {
    baseContext.userEmail = authReq.user.email; // Should already be redacted from JWT
  }
  
  const requestLogger = getLogger().child(baseContext);

  // Track request start for metrics
  const metricsCollector = getMetricsCollector();
  metricsCollector.increment('http_requests_total', {
    method: req.method,
    path: normalizePath(req.originalUrl),
  });

  // Capture response finish event
  res.on('finish', () => {
    const duration = calculateDuration(startTime);
    
    // Get safe request metadata
    const contentLength = req.get('content-length');
    const responseContentLength = res.getHeader('content-length')?.toString();
    
    // Log the request with PII-safe data
    requestLogger.info('HTTP Request', {
      statusCode: res.statusCode,
      responseTime: duration,
      userAgent: req.get('user-agent')?.split(' ')[0], // Just browser name
      ip: req.ip,
      authorization: redactAuthHeader(req.headers.authorization),
      hasApiKey: !!(req.headers['x-api-key'] || req.headers['authorization']),
      contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
      responseSize: responseContentLength ? parseInt(responseContentLength, 10) : undefined,
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

    // Track slow requests (>1s threshold)
    if (duration > 1000) {
      metricsCollector.increment('http_slow_requests_total', {
        method: req.method,
        path: normalizePath(req.originalUrl),
        threshold: '1000ms',
      });
      
      // Enhanced slow request warning with handler details
      requestLogger.warn('Slow request detected', {
        responseTime: duration,
        threshold: 1000,
        route: req.route?.path || req.originalUrl,
        handler: req.route?.stack?.[0]?.name || 'anonymous',
        method: req.method,
        statusCode: res.statusCode,
        contentLength: contentLength,
        queryParamCount: Object.keys(req.query || {}).length,
        bodyParamCount: typeof req.body === 'object' && req.body !== null ? Object.keys(req.body).length : 0,
      });
    }
    
    // Track very slow requests (>5s) with higher severity
    if (duration > 5000) {
      requestLogger.error('Critical slow request detected', {
        responseTime: duration,
        threshold: 5000,
        route: req.route?.path || req.originalUrl,
        handler: req.route?.stack?.[0]?.name || 'anonymous',
        method: req.method,
        statusCode: res.statusCode,
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
