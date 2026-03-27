import { Logger, LogEntry, LogLevel, LogContext, MetricsCollector, MetricEvent, MetricsTags } from '../types/logging.types';

/**
 * Structured JSON Logger for Production Observability
 * 
 * Emits JSON-formatted logs with consistent structure for easy parsing
 * by log aggregation systems (ELK, Datadog, CloudWatch, etc.)
 */
class StructuredLogger implements Logger {
  private readonly service: string;
  private readonly version: string;
  private readonly environment: string;
  private readonly defaultContext: LogContext;
  private readonly minLevel: LogLevel;
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(
    service: string = 'fluxapay-backend',
    version: string = process.env.npm_package_version || '1.0.0',
    environment: string = process.env.NODE_ENV || 'development',
    defaultContext: LogContext = {}
  ) {
    this.service = service;
    this.version = version;
    this.environment = environment;
    this.defaultContext = defaultContext;
    this.minLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      version: this.version,
      environment: this.environment,
    };

    // Merge default context with provided context
    const mergedContext = { ...this.defaultContext, ...context };
    if (Object.keys(mergedContext).length > 0) {
      entry.context = mergedContext;
    }

    return entry;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.formatLogEntry(level, message, context);
    const jsonLog = JSON.stringify(entry);

    // Use appropriate console method based on level
    switch (level) {
      case 'debug':
        console.debug(jsonLog);
        break;
      case 'info':
        console.info(jsonLog);
        break;
      case 'warn':
        console.warn(jsonLog);
        break;
      case 'error':
        console.error(jsonLog);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  child(context: LogContext): Logger {
    return new StructuredLogger(
      this.service,
      this.version,
      this.environment,
      { ...this.defaultContext, ...context }
    );
  }
}

/**
 * In-Memory Metrics Collector
 * 
 * Collects basic metrics for production monitoring.
 * In production, consider replacing with Prometheus/DataDog metrics.
 */
class InMemoryMetricsCollector implements MetricsCollector {
  private metrics: MetricEvent[] = [];
  private readonly maxMetrics: number = 10000; // Prevent unbounded growth

  increment(name: string, tags?: MetricsTags, value: number = 1): void {
    this.addMetric({
      name,
      value,
      type: 'counter',
      tags,
      timestamp: Date.now(),
    });
  }

  gauge(name: string, value: number, tags?: MetricsTags): void {
    this.addMetric({
      name,
      value,
      type: 'gauge',
      tags,
      timestamp: Date.now(),
    });
  }

  histogram(name: string, value: number, tags?: MetricsTags): void {
    this.addMetric({
      name,
      value,
      type: 'histogram',
      tags,
      timestamp: Date.now(),
    });
  }

  timer(name: string, startTime: [number, number], tags?: MetricsTags): void {
    const duration = this.calculateDuration(startTime);
    this.histogram(name, duration, tags);
  }

  private calculateDuration(startTime: [number, number]): number {
    const endTime = process.hrtime();
    return (endTime[0] - startTime[0]) * 1000 + (endTime[1] - startTime[1]) / 1000000;
  }

  private addMetric(metric: MetricEvent): void {
    // Remove oldest metrics if we exceed the limit
    if (this.metrics.length >= this.maxMetrics) {
      this.metrics = this.metrics.slice(-Math.floor(this.maxMetrics / 2));
    }
    this.metrics.push(metric);
  }

  getMetrics(): MetricEvent[] {
    return [...this.metrics];
  }

  reset(): void {
    this.metrics = [];
  }

  /**
   * Get aggregated metrics summary
   */
  getSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    this.metrics.forEach((metric) => {
      const key = metric.name;
      if (!summary[key]) {
        summary[key] = {
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
          lastValue: 0,
        };
      }

      summary[key].count += 1;
      summary[key].sum += metric.value;
      summary[key].min = Math.min(summary[key].min, metric.value);
      summary[key].max = Math.max(summary[key].max, metric.value);
      summary[key].lastValue = metric.value;
    });

    // Calculate averages
    Object.keys(summary).forEach((key) => {
      if (summary[key].count > 0) {
        summary[key].avg = summary[key].sum / summary[key].count;
      }
      // Clean up Infinity values
      if (summary[key].min === Infinity) summary[key].min = 0;
      if (summary[key].max === -Infinity) summary[key].max = 0;
    });

    return summary;
  }
}

// Singleton instances
let loggerInstance: StructuredLogger | null = null;
let metricsInstance: InMemoryMetricsCollector | null = null;

export function getLogger(service?: string): Logger {
  if (!loggerInstance) {
    loggerInstance = new StructuredLogger(service);
  }
  return loggerInstance;
}

export function getMetricsCollector(): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new InMemoryMetricsCollector();
  }
  return metricsInstance;
}

// Export for testing and direct usage
export { StructuredLogger, InMemoryMetricsCollector };
