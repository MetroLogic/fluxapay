import cors, { CorsOptions } from 'cors';
import { getEnvConfig } from '../config/env.config';

/**
 * CORS Middleware Configuration
 *
 * Provides secure CORS configuration based on environment variables:
 * - Development: Allows localhost origins only (any port). Override with CORS_ORIGINS.
 * - Production: Requires explicit CORS_ORIGINS environment variable (comma-separated allowlist).
 * - Test: Allows all origins for easier testing.
 */

/** Localhost origin pattern: http(s)://localhost:<port> or http(s)://127.0.0.1:<port> */
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Parse comma-separated CORS origins from environment variable
 */
function parseCorsOrigins(): string[] {
  const config = getEnvConfig();
  
  if (!config.CORS_ORIGINS || config.CORS_ORIGINS.trim() === '') {
    return [];
  }
  
  return config.CORS_ORIGINS
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

/**
 * Check if an origin is allowed
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  
  // Allow wildcard for specific use cases (use with caution)
  if (allowedOrigins.includes('*')) {
    return true;
  }
  
  // Check exact matches
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
  // Check wildcard patterns (e.g., *.example.com)
  for (const pattern of allowedOrigins) {
    if (pattern.startsWith('*.')) {
      const domain = pattern.substring(2);
      if (origin.endsWith(domain) && origin.match(/^[^.]+\./)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get CORS options based on environment
 */
export function getCorsOptions(): CorsOptions {
  const config = getEnvConfig();
  const nodeEnv = config.NODE_ENV;
  
  // Development: Allow localhost origins only (or CORS_ORIGINS override if provided)
  if (nodeEnv === 'development') {
    const overrideOrigins = parseCorsOrigins();
    return {
      origin: (origin, callback) => {
        // Requests with no Origin header (e.g. curl, server-to-server) are allowed in dev.
        if (!origin) {
          callback(null, true);
          return;
        }
        // If CORS_ORIGINS is explicitly set in dev, honour it.
        if (overrideOrigins.length > 0) {
          if (isOriginAllowed(origin, overrideOrigins)) {
            callback(null, true);
          } else {
            callback(new Error(`Origin ${origin} not in CORS_ORIGINS allowlist`), false);
          }
          return;
        }
        // Default dev policy: localhost / 127.0.0.1 only.
        if (LOCALHOST_ORIGIN_RE.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} is not a localhost origin. Set CORS_ORIGINS to allow additional origins in development.`), false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Secret'],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86400, // 24 hours
    };
  }
  
  // Test: Allow all origins for easier testing
  if (nodeEnv === 'test') {
    return {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Secret'],
    };
  }
  
  // Production: Strict origin checking
  const allowedOrigins = parseCorsOrigins();
  
  if (allowedOrigins.length === 0) {
    console.warn('⚠️  WARNING: CORS_ORIGINS not set in production. No origins will be allowed!');
    console.warn('   Set CORS_ORIGINS environment variable (comma-separated list of allowed origins)');
    console.warn('   Example: CORS_ORIGINS="https://app.fluxapay.com,https://dashboard.fluxapay.com"');
  }
  
  return {
    origin: (origin, callback) => {
      if (!origin) {
        // Block non-browser requests without origin
        callback(new Error('Missing origin'), false);
        return;
      }
      
      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
      } else {
        console.warn(`🚫 CORS: Blocked origin ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Secret'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400, // 24 hours
  };
}

/**
 * CORS Middleware Factory
 * Use this instead of app.use(cors())
 * Call this function to get the CORS middleware with current environment settings
 */
export function createCorsMiddleware() {
  return cors(getCorsOptions());
}

/**
 * Default CORS middleware instance
 * For most use cases, use this directly: app.use(corsMiddleware)
 * The middleware is lazily initialized on first use
 */
let _corsMiddleware: ReturnType<typeof cors> | undefined;

function getCorsMiddleware(): ReturnType<typeof cors> {
  if (!_corsMiddleware) {
    _corsMiddleware = cors(getCorsOptions());
  }
  return _corsMiddleware;
}

// Export a wrapper function that behaves like middleware
export const corsMiddleware = (
  req: any,
  res: any,
  next: () => void
) => {
  const middleware = getCorsMiddleware();
  return middleware(req, res, next);
};

/**
 * Reset CORS options (useful for testing)
 */
export function resetCorsOptions(): void {
  // This function exists for testing purposes
  // The actual reset happens via environment variables
}
