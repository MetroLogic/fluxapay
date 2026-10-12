# Observability Implementation Guide

## Overview

This document describes the debugging and production observability features implemented in the FluxaPay backend. These features provide:

- **Request Tracing**: Unique request IDs for end-to-end request tracking
- **Structured Logging**: JSON-formatted logs for easy parsing by log aggregation systems
- **Basic Metrics**: Request/response metrics for monitoring and alerting
- **Graceful Shutdown**: Proper cleanup on server termination

## Technical Requirements Met

✅ **Request ID Middleware** (`x-request-id`)  
✅ **Structured JSON Logs** with key fields  
✅ **Basic Metrics Hooks**  

## Architecture

```
Request → Request ID → Request Logging → Metrics → Route Handler → Response
              ↓              ↓              ↓
         (x-request-id)  (JSON logs)   (Counters/Timers)
```

## Components

### 1. Request ID Middleware

**File**: `src/middleware/requestId.middleware.ts`

Generates or propagates a unique request ID for each incoming request.

**Features**:
- Uses `x-request-id` header if provided by client
- Generates UUID v4 if not provided
- Attaches to request object for use in handlers
- Adds to response headers for client visibility

**Usage**:
```typescript
// Automatically applied to all requests
// Access in handlers via:
const requestId = req.requestId;

// Or in response headers:
// x-request-id: <uuid>
```

### 2. Structured Logger

**File**: `src/utils/logger.ts`

Provides a structured JSON logger for consistent log formatting.

**Features**:
- JSON-formatted output for easy parsing
- Log levels: debug, info, warn, error
- Configurable minimum log level via `LOG_LEVEL` env var
- Context enrichment (requestId, userId, etc.)
- Child loggers for scoped logging

**Log Format**:
```json
{
  "level": "info",
  "message": "HTTP Request",
  "timestamp": "2024-02-27T10:30:00.000Z",
  "service": "fluxapay-backend",
  "version": "1.0.0",
  "environment": "production",
  "context": {
    "requestId": "abc-123-def",
    "method": "POST",
    "path": "/api/v1/payments",
    "statusCode": 200,
    "responseTime": 145.23
  }
}
```

**Usage**:
```typescript
import { getLogger } from './utils/logger';

const logger = getLogger();

// Basic logging
logger.info('Payment processed', { paymentId: 'pay_123' });
logger.error('Payment failed', { error: err.message });

// Child logger with context
const requestLogger = logger.child({ requestId: req.requestId });
requestLogger.info('Processing started');
```

### 3. Request Logging Middleware

**File**: `src/middleware/requestLogging.middleware.ts`

Automatically logs all HTTP requests with timing and status information.

**Features**:
- Logs method, path, status code, response time
- Tracks slow requests (>1000ms)
- Captures user agent and IP
- Emits metrics for monitoring

**Logged Fields**:
- `requestId` - Unique request identifier
- `method` - HTTP method (GET, POST, etc.)
- `path` - Request path
- `statusCode` - Response status code
- `responseTime` - Request duration in ms
- `userAgent` - Client user agent
- `ip` - Client IP address

### 4. Metrics Middleware

**File**: `src/middleware/metrics.middleware.ts`

Collects and exposes basic application metrics.

**Features**:
- Request counters
- Response time histograms
- Error tracking
- Business metrics helpers
- `/metrics` endpoint for scraping

**Metrics Endpoints**:
- `GET /metrics` - Prometheus-style metrics output

**Key Metrics**:
- `http_requests_total` - Total HTTP requests (counter)
- `http_request_duration_ms` - Request latency (histogram)
- `http_errors_total` - HTTP errors by status code (counter)
- `http_slow_requests_total` - Requests >1000ms (counter)
- `application_errors_total` - Application errors (counter)

**Business Metrics Helpers**:
```typescript
import {
  trackPaymentInitiated,
  trackPaymentCompleted,
  trackPaymentFailed,
  trackKYCSubmission,
  trackSettlementBatchInitiated,
  trackDatabaseQuery,
  trackExternalApiCall,
} from './middleware/metrics.middleware';

// Example usage in payment service
trackPaymentInitiated(amount, currency, method);
// ... process payment ...
trackPaymentCompleted(duration, amount, currency, status);
```

### 5. Graceful Shutdown

**File**: `src/index.ts`

Handles server shutdown gracefully with proper cleanup.

**Features**:
- Handles SIGTERM and SIGINT signals
- Closes database connections (Prisma)
- Allows existing requests to complete (30s timeout)
- Logs shutdown progress
- Handles uncaught exceptions and rejections

**Shutdown Sequence**:
1. Stop accepting new requests
2. Close Prisma database connections
3. Wait for existing requests to complete (max 30s)
4. Exit process

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level | `info` |
| `NODE_ENV` | Environment name | `development` |
| `PORT` | Server port | - |

**Log Levels** (in order of severity):
- `debug` - All logs
- `info` - Info, warn, error
- `warn` - Warn, error
- `error` - Error only

## Integration Points

### Middleware Order in `app.ts`

```typescript
// 1. Request ID (first - generates ID for tracing)
app.use(requestIdMiddleware);

// 2. Request Logging (uses request ID)
app.use(requestLoggingMiddleware);

// 3. Metrics (tracks all requests)
app.use(metricsMiddleware);

// 4. Other middleware (CORS, body parsers, etc.)
app.use(cors());
app.use(express.json());

// 5. Routes
app.use('/api/v1/...', routes);

// 6. Error Logging (last - catches all errors)
app.use(errorLoggingMiddleware);
```

### Using in Services/Controllers

```typescript
import { getLogger } from './utils/logger';
import { getMetricsCollector } from './utils/logger';

const logger = getLogger();
const metrics = getMetricsCollector();

export async function processPayment(paymentData: PaymentData) {
  const startTime = process.hrtime();
  
  try {
    logger.info('Processing payment', { 
      paymentId: paymentData.id,
      amount: paymentData.amount 
    });
    
    // ... payment logic ...
    
    metrics.increment('payments_processed_total');
    logger.info('Payment completed', { paymentId: paymentData.id });
    
  } catch (error) {
    logger.error('Payment processing failed', { 
      paymentId: paymentData.id,
      error: error.message 
    });
    metrics.increment('payments_failed_total', { error_type: error.name });
    throw error;
  }
}
```

## Monitoring & Alerting

### Log Aggregation

Configure your log aggregator to parse JSON logs:

**ELK Stack (Elasticsearch, Logstash, Kibana)**:
```
Use JSON codec to parse logs
Index by: service, environment, level, requestId
```

**Datadog**:
```
Enable JSON log parsing
Create facets for: requestId, statusCode, responseTime
Set up monitors for error rate and slow requests
```

**CloudWatch**:
```
Use subscription filters for JSON logs
Create metric filters for error rates
Set up alarms for 5xx errors
```

### Key Metrics to Monitor

1. **Request Rate**: `http_requests_total`
2. **Error Rate**: `http_errors_total` / `http_requests_total`
3. **Latency**: `http_request_duration_ms` (p50, p95, p99)
4. **Slow Requests**: `http_slow_requests_total`
5. **Application Errors**: `application_errors_total`

### Recommended Alerts

- **Error Rate > 5%**: Investigate application errors
- **P95 Latency > 1000ms**: Performance degradation
- **Slow Request Spike**: Possible bottleneck
- **Graceful Shutdown Failures**: Cleanup issues

## Testing

### Local Testing

```bash
# Start server
npm run dev

# Make requests with custom request ID
curl -H "x-request-id: my-custom-id" http://localhost:3000/health

# Check metrics endpoint
curl http://localhost:3000/metrics

# View structured logs in console
```

### Verify Log Format

Logs should be valid JSON with required fields:
```bash
# Test and check log output
npm test

# Look for JSON logs in console output
```

## Production Deployment

### 1. Set Log Level

```bash
# Production (reduce log volume)
export LOG_LEVEL=info

# Debug (for troubleshooting)
export LOG_LEVEL=debug
```

### 2. Configure Log Aggregator

Ensure your log aggregator is configured to:
- Parse JSON logs
- Extract key fields (requestId, level, message)
- Create alerts for error patterns

### 3. Set Up Metrics Scraping

Configure Prometheus or monitoring system to scrape `/metrics`:

```yaml
# Prometheus example
scrape_configs:
  - job_name: 'fluxapay-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### 4. Test Graceful Shutdown

```bash
# Send SIGTERM
kill -TERM <pid>

# Check logs for graceful shutdown sequence
# Verify no requests are dropped
```

## Troubleshooting

### Missing Request IDs

**Problem**: Requests don't have `x-request-id`

**Solution**: Ensure `requestIdMiddleware` is first middleware in `app.ts`

### Logs Not Appearing

**Problem**: Expected logs not showing

**Solution**: 
1. Check `LOG_LEVEL` environment variable
2. Verify logger is imported and used correctly
3. Check log aggregator configuration

### Metrics Not Scraping

**Problem**: `/metrics` endpoint returns empty data

**Solution**:
1. Verify `metricsMiddleware` is loaded
2. Make some requests to generate metrics
3. Check metrics collector is singleton (not recreated)

### High Memory Usage

**Problem**: Metrics collector using too much memory

**Solution**:
- Metrics are limited to 10,000 events (configurable in `logger.ts`)
- Consider external metrics system (Prometheus, DataDog) for production

## Future Enhancements

### Recommended Improvements

1. **Distributed Tracing**: Integrate with Jaeger/Zipkin for cross-service tracing
2. **External Metrics**: Replace in-memory metrics with Prometheus client
3. **Log Sampling**: Sample debug logs in production to reduce volume
4. **Custom Dashboards**: Create Grafana/DataDog dashboards
5. **Health Checks**: Enhanced health endpoints with dependency checks
6. **Request Context**: Propagate context through async operations

### Migration to Production Logging Services

For production, consider replacing the in-memory logger with:

- **Winston** + **Winston-Transport** for Datadog/CloudWatch
- **Pino** for high-performance JSON logging
- **Bunyan** for structured logging with rotation

## Files Created/Modified

### New Files
- `src/types/logging.types.ts` - TypeScript types for logging/metrics
- `src/utils/logger.ts` - Structured logger and metrics collector
- `src/middleware/requestId.middleware.ts` - Request ID generation
- `src/middleware/requestLogging.middleware.ts` - HTTP request logging
- `src/middleware/metrics.middleware.ts` - Metrics collection and exposure

### Modified Files
- `src/types/express.d.ts` - Added `requestId` to AuthRequest
- `src/app.ts` - Integrated observability middleware
- `src/index.ts` - Added graceful shutdown and structured logging

## Summary

This implementation provides a solid foundation for debugging and production observability:

✅ **Request Tracing**: Every request has a unique ID for end-to-end tracking  
✅ **Structured Logs**: JSON logs ready for log aggregation systems  
✅ **Basic Metrics**: Request/response metrics for monitoring  
✅ **Graceful Shutdown**: Clean shutdown with proper resource cleanup  

The system is designed to be simple yet effective, with clear migration paths to more sophisticated observability tools as needed.
