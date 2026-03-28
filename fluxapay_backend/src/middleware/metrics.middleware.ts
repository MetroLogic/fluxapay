import { Request, Response, NextFunction } from 'express';
import { getMetricsCollector } from '../utils/logger';
import { getLogger } from '../utils/logger';

/**
 * Metrics Endpoint Middleware
 * 
 * Exposes a /metrics endpoint for scraping metrics.
 * In production, this should be protected and only accessible
 * from monitoring systems.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics' && req.method === 'GET') {
    const metricsCollector = getMetricsCollector();
    const logger = getLogger();
    
    const metrics = metricsCollector.getMetrics();
    const summary = metricsCollector.getSummary();
    
    // Log metrics scrape
    logger.debug('Metrics scraped', {
      metricCount: metrics.length,
      summaryKeys: Object.keys(summary),
    });
    
    // Return metrics in Prometheus-like format
    res.set('Content-Type', 'text/plain');
    res.send(formatMetrics(summary));
    return;
  }
  
  next();
}

/**
 * Format metrics for Prometheus-style output
 */
function formatMetrics(summary: Record<string, any>): string {
  const lines: string[] = [];
  
  Object.entries(summary).forEach(([name, data]: [string, any]) => {
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    lines.push(`# HELP ${safeName} Application metric`);
    lines.push(`# TYPE ${safeName} gauge`);
    
    if (data.count !== undefined) {
      lines.push(`${safeName}_count ${data.count}`);
    }
    if (data.sum !== undefined) {
      lines.push(`${safeName}_sum ${data.sum}`);
    }
    if (data.avg !== undefined) {
      lines.push(`${safeName}_avg ${data.avg.toFixed(2)}`);
    }
    if (data.min !== undefined) {
      lines.push(`${safeName}_min ${data.min}`);
    }
    if (data.max !== undefined) {
      lines.push(`${safeName}_max ${data.max}`);
    }
    if (data.lastValue !== undefined) {
      lines.push(`${safeName}_last ${data.lastValue}`);
    }
  });
  
  return lines.join('\n');
}

/**
 * Business Metrics Helper Functions
 * 
 * These can be imported and used throughout the application
 * to track business-specific metrics.
 */

export function trackPaymentInitiated(amount: number, currency: string, method?: string): void {
  const metrics = getMetricsCollector();
  metrics.increment('payments_initiated_total', { currency, method: method || 'unknown' });
  metrics.histogram('payment_amount', amount, { currency });
}

export function trackPaymentCompleted(
  duration: number,
  amount: number,
  currency: string,
  status: string
): void {
  const metrics = getMetricsCollector();
  metrics.increment('payments_completed_total', { currency, status });
  metrics.histogram('payment_completion_amount', amount, { currency });
  metrics.histogram('payment_processing_time_ms', duration);
}

export function trackPaymentFailed(errorType: string, currency: string): void {
  const metrics = getMetricsCollector();
  metrics.increment('payments_failed_total', { error_type: errorType, currency });
}

export function trackKYCSubmission(status: string, method: string): void {
  const metrics = getMetricsCollector();
  metrics.increment('kyc_submissions_total', { status, method });
}

export function trackSettlementBatchInitiated(merchantCount: number, currency: string): void {
  const metrics = getMetricsCollector();
  metrics.increment('settlement_batches_total', { currency });
  metrics.histogram('settlement_batch_merchant_count', merchantCount);
}

export function trackDatabaseQuery(duration: number, table: string, operation: string): void {
  const metrics = getMetricsCollector();
  metrics.histogram('database_query_duration_ms', duration, { table, operation });
  
  // Track slow queries
  if (duration > 100) {
    metrics.increment('database_slow_queries_total', { table, operation });
  }
}

export function trackExternalApiCall(
  api: string,
  duration: number,
  status: string,
  endpoint?: string
): void {
  const metrics = getMetricsCollector();
  metrics.histogram('external_api_duration_ms', duration, { api, status });
  metrics.increment('external_api_calls_total', { api, status, endpoint: endpoint || 'unknown' });
}
