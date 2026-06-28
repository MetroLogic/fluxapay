import cors, { CorsOptions } from 'cors';
import { getEnvConfig } from '../config/env.config';
import { PrismaClient } from '../generated/client/client';

let prisma: PrismaClient | null = null;

function getPrismaInstance(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * CORS Middleware Configuration
 *
 * Provides secure CORS configuration based on environment variables:
 * - Development: Allows localhost origins only (explicit port list). Override with CORS_ORIGINS.
 * - Staging: Staging domains only.
 * - Production: Requires specific domains (https://app.fluxapay.com, https://fluxapay.com) and merchant-registered webhook origins.
 * - Test: Allows all origins for easier testing.
 */

// Development: localhost only with explicit port list
const ALLOWED_DEV_PORTS = [3000, 3001, 4000, 5000, 5173, 8000, 8080, 9000];
const ALLOWED_DEV_ORIGINS = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
  ...ALLOWED_DEV_PORTS.flatMap(port => [
    `http://localhost:${port}`,
    `https://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `https://127.0.0.1:${port}`
  ])
];

// Staging: staging domains only
const STAGING_ORIGINS = [
  'https://staging.fluxapay.com',
  'https://app.staging.fluxapay.com',
  'https://api.staging.fluxapay.com',
];

// Production: only https://app.fluxapay.com, https://fluxapay.com, and merchant-registered webhook origins
const PRODUCTION_ORIGINS = [
  'https://app.fluxapay.com',
  'https://fluxapay.com',
];

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
 * Check if an origin is allowed (for dev CORS_ORIGINS override check)
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  
  if (allowedOrigins.includes('*')) {
    return true;
  }
  
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
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
 * Extract origin from a URL
 */
function getUrlOrigin(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Check if origin is a merchant-registered webhook origin
 */
async function isMerchantWebhookOrigin(origin: string): Promise<boolean> {
  try {
    const db = getPrismaInstance();
    const merchants = await db.merchant.findMany({
      where: {
        webhook_url: {
          startsWith: origin,
        },
      },
      select: {
        webhook_url: true,
      },
    });

    for (const merchant of merchants) {
      if (merchant.webhook_url && getUrlOrigin(merchant.webhook_url) === origin) {
        return true;
      }
    }
  } catch (error) {
    console.error('Error fetching merchant webhook origins:', error);
  }
  return false;
}

/**
 * Get CORS options based on environment
 */
export function getCorsOptions(): CorsOptions {
  const config = getEnvConfig();
  const nodeEnv = config.NODE_ENV;
  
  // Development: Allow localhost origins only with explicit port list (or CORS_ORIGINS override if provided)
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
        // Default dev policy: localhost with explicit ports only.
        if (ALLOWED_DEV_ORIGINS.includes(origin)) {
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

  // Staging: staging domains only
  if (nodeEnv === 'staging') {
    return {
      origin: (origin, callback) => {
        if (!origin) {
          callback(new Error('Missing origin'), false);
          return;
        }
        if (STAGING_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`🚫 CORS: Blocked origin ${origin} in staging`);
          callback(new Error(`Origin ${origin} not allowed by CORS in staging`), false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Secret'],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86400, // 24 hours
    };
  }
  
  // Production: Strict origin checking
  return {
    origin: async (origin, callback) => {
      if (!origin) {
        // Block non-browser requests without origin
        callback(new Error('Missing origin'), false);
        return;
      }
      
      // Check hardcoded production origins
      if (PRODUCTION_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      // Check merchant-registered webhook origins
      const isAllowedWebhook = await isMerchantWebhookOrigin(origin);
      if (isAllowedWebhook) {
        callback(null, true);
        return;
      }
      
      console.warn(`🚫 CORS: Blocked origin ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
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
