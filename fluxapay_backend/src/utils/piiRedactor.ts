import { createHash } from 'crypto';

/**
 * PII Redaction Utilities for Production Logging
 * 
 * Ensures sensitive data is never logged in production environments.
 */

/**
 * Redact Authorization headers and API keys from logs
 */
export function redactAuthHeader(headerValue?: string): string {
  if (!headerValue) {
    return '[REDACTED]';
  }

  // Handle Bearer tokens
  if (headerValue.startsWith('Bearer ')) {
    const token = headerValue.substring(7);
    return `Bearer ${redactToken(token)}`;
  }

  // Handle Basic auth
  if (headerValue.startsWith('Basic ')) {
    const credentials = headerValue.substring(6);
    return `Basic ${redactToken(credentials)}`;
  }

  // Handle AccessKey (MessageBird style)
  if (headerValue.startsWith('AccessKey ')) {
    const key = headerValue.substring(10);
    return `AccessKey ${redactToken(key)}`;
  }

  // Unknown auth format - redact entirely
  return '[REDACTED]';
}

/**
 * Redact API keys from logs
 */
export function redactApiKey(apiKey?: string): string {
  if (!apiKey) {
    return '[REDACTED]';
  }

  // Show only last 4 characters for identification
  if (apiKey.length > 8) {
    return `***${apiKey.slice(-4)}`;
  }

  return '[REDACTED]';
}

/**
 * Redact generic tokens (JWT, session tokens, etc.)
 */
export function redactToken(token: string): string {
  if (!token) {
    return '[REDACTED]';
  }

  // Show first 4 and last 4 characters for debugging purposes
  if (token.length > 12) {
    return `${token.substring(0, 4)}...${token.slice(-4)}`;
  }

  return '[REDACTED]';
}

/**
 * Hash sensitive identifiers for correlation without exposing PII
 */
export function hashIdentifier(value: string, salt: string = ''): string {
  if (!value) {
    return '[UNKNOWN]';
  }

  const hash = createHash('sha256');
  hash.update(`${salt}${value}`);
  return hash.digest('hex').substring(0, 16); // First 16 chars for readability
}

/**
 * Create a short hash for merchantId logging
 */
export function hashMerchantId(merchantId: string): string {
  return hashIdentifier(merchantId, 'merchant_salt_');
}

/**
 * Redact email addresses while preserving domain for analytics
 */
export function redactEmail(email?: string): string {
  if (!email) {
    return '[REDACTED]';
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return '[INVALID_EMAIL]';
  }

  const [username, domain] = parts;
  
  // Show first 2 chars of username + ***@domain
  if (username.length > 2) {
    return `${username.substring(0, 2)}***@${domain}`;
  }

  return `**@${domain}`;
}

/**
 * Sanitize request/response body for logging
 * Removes or redacts sensitive fields
 */
export function sanitizeObject(obj: any, sensitiveFields: string[] = []): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const defaultSensitiveFields = [
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'authorization',
    'creditCard',
    'credit_card',
    'cvv',
    'pin',
    'account_number',
    'accountNumber',
    'account_name',
    'accountName',
    'email',
    'phone_number',
    'phone',
  ];

  const allSensitiveFields = [...defaultSensitiveFields, ...sensitiveFields];

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    
    if (allSensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(sanitized[key], sensitiveFields);
    }
  }

  return sanitized;
}

/**
 * Get safe request metadata for logging
 */
export function getSafeRequestMetadata(req: any) {
  const headers = req.headers || {};
  
  return {
    method: req.method,
    path: req.originalUrl || req.url,
    route: req.route?.path || req.originalUrl || req.url,
    statusCode: req.res?.statusCode,
    userAgent: headers['user-agent'] ? headers['user-agent'].split(' ')[0] : undefined, // Just browser name
    ip: req.ip,
    requestId: req.requestId || req.headers['x-request-id'],
    hasAuthHeader: !!(headers['authorization'] || headers['x-api-key']),
    contentType: headers['content-type'],
    contentLength: headers['content-length'],
  };
}
