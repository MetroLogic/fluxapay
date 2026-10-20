import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  [key: string]: any;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context if it exists
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current request ID if it exists
 */
export function getRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}

/** Get the current correlation ID if it exists. */
export function getCorrelationId(): string | undefined {
  return getRequestContext()?.correlationId;
}
