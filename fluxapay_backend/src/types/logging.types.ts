/**
 * Logging and Observability Types
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  responseTime?: number;
  userId?: string;
  merchantId?: string;
  paymentId?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  service: string;
  version: string;
  environment: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

export interface MetricsTags {
  [key: string]: string | number;
}

export interface MetricEvent {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  tags?: MetricsTags;
  timestamp?: number;
}

export interface MetricsCollector {
  increment(name: string, tags?: MetricsTags, value?: number): void;
  gauge(name: string, value: number, tags?: MetricsTags): void;
  histogram(name: string, value: number, tags?: MetricsTags): void;
  timer(name: string, startTime: [number, number], tags?: MetricsTags): void;
  getMetrics(): MetricEvent[];
  reset(): void;
}
