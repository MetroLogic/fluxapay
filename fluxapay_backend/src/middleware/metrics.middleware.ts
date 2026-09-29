import { Request, Response, NextFunction } from 'express';
import { getMetricsCollector } from '../utils/logger';
import { getLogger } from '../utils/logger';
import { adminAuth } from './adminAuth.middleware';
import { MetricEvent, MetricsTags } from '../types/logging.types';

/**
 * Prometheus counter families exposed by the `/metrics` endpoint.
 *
 * The in-memory collector records business events under internal names; the
 * endpoint re-exposes the counters the platform owns with a `fluxapay_` prefix
 * and the `_total` suffix Prometheus expects for counters.
 */
const PROMETHEUS_COUNTERS: Record<string, { promName: string; help: string }> = {
  payments_created_total: {
    promName: 'fluxapay_payments_created_total',
    help: 'Total number of payments created.',
  },
  payments_confirmed_total: {
    promName: 'fluxapay_payments_confirmed_total',
    help: 'Total number of payments confirmed.',
  },
  webhook_deliveries_total: {
    promName: 'fluxapay_webhook_delivery_total',
    help: 'Total number of webhook deliveries, labelled by status.',
  },
  settlement_batches_total: {
    promName: 'fluxapay_settlement_batch_total',
    help: 'Total number of settlement batches initiated, labelled by currency.',
  },
};

/**
 * Escape a label value for the Prometheus text exposition format.
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Normalize the collector's tags into a deterministic, string-valued label set.
 */
function normalizeLabels(tags: MetricsTags | undefined): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!tags) return labels;
  for (const [key, value] of Object.entries(tags)) {
    labels[key] = String(value);
  }
  return labels;
}

function serializeLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  const body = keys.map((key) => `${key}="${escapeLabelValue(labels[key])}"`).join(',');
  return `{${body}}`;
}

/**
 * Render the collector's counter events in Prometheus text exposition format.
 *
 * Events of the same family and label set are summed into a single sample.
 * Families without any recorded sample are omitted so the output stays stable
 * as counters spin up.
 */
export function renderPrometheusMetrics(events: MetricEvent[]): string {
  // family name -> help
  const helpByName: Record<string, string> = {};
  for (const mapping of Object.values(PROMETHEUS_COUNTERS)) {
    helpByName[mapping.promName] = mapping.help;
  }

  // promName + serialized labels -> accumulated value
  const samples = new Map<string, { name: string; value: number; labels: string }>();

  for (const event of events) {
    if (event.type !== 'counter') continue;
    const mapping = PROMETHEUS_COUNTERS[event.name];
    if (!mapping) continue;

    const labels = serializeLabels(normalizeLabels(event.tags));
    const key = `${mapping.promName}\u0000${labels}`;
    const existing = samples.get(key);
    if (existing) {
      existing.value += event.value;
    } else {
      samples.set(key, { name: mapping.promName, value: event.value, labels });
    }
  }

  const lines: string[] = [];
  const emittedFamilies = new Set<string>();

  for (const sample of samples.values()) {
    if (!emittedFamilies.has(sample.name)) {
      emittedFamilies.add(sample.name);
      lines.push(`# HELP ${sample.name} ${helpByName[sample.name] ?? 'Application metric.'}`);
      lines.push(`# TYPE ${sample.name} counter`);
    }
    lines.push(`${sample.name}${sample.labels} ${sample.value}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Metrics Endpoint Middleware
 *
 * Exposes a `/metrics` endpoint (admin-auth protected) that returns the
 * business counters in Prometheus text exposition format for scraping.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isMetricsRequest = req.path === '/metrics' && req.method === 'GET';
  if (!isMetricsRequest) {
    next();
    return;
  }

  adminAuth(req, res, () => {
    const collector = getMetricsCollector();
    const logger = getLogger();
    const events = collector.getMetrics();

    logger.debug('Metrics scraped', {
      eventCount: events.length,
      families: Object.keys(PROMETHEUS_COUNTERS),
    });

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(renderPrometheusMetrics(events));
  });
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

export function trackPaymentCreated(): void {
  const metrics = getMetricsCollector();
  metrics.increment('payments_created_total');
}

export function trackPaymentConfirmed(): void {
  const metrics = getMetricsCollector();
  metrics.increment('payments_confirmed_total');
}

export function trackPaymentExpired(count: number = 1): void {
  const metrics = getMetricsCollector();
  metrics.increment('payments_expired_total', undefined, count);
}

export function trackWebhookDelivery(status: 'success' | 'fail'): void {
  const metrics = getMetricsCollector();
  metrics.increment('webhook_deliveries_total', { status });
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

export function trackFunderBalanceLow(): void {
  getMetricsCollector().increment('funder_balance_low');
}

export function trackAddressPoolDepleted(): void {
  getMetricsCollector().increment('address_pool_depleted');
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