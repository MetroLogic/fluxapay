# CORS Environment-Based Allowlist Implementation

## Overview
Implemented secure, environment-based CORS configuration to replace the permissive `cors()` setup in production.

## Changes Made

### 1. Environment Configuration (`src/config/env.config.ts`)
- Added `CORS_ORIGINS` as an optional environment variable (comma-separated string)
- Validated via Zod schema

### 2. Environment Example (`.env.example`)
Added documentation for CORS configuration:
```bash
# ─── CORS Configuration ────────────────────────────────────────────────────────
# Comma-separated list of allowed origins (e.g., "https://app.fluxapay.com,https://dashboard.fluxapay.com")
# In development, localhost is automatically allowed
# In production, you MUST set this to your actual frontend domains
# CORS_ORIGINS="https://app.fluxapay.com,https://dashboard.fluxapay.com"
```

### 3. CORS Middleware (`src/middleware/cors.middleware.ts`)
Created new middleware with environment-aware behavior:

#### Development Mode (`NODE_ENV=development`)
- Allows all origins for developer convenience
- Supports credentials
- Includes proper headers and methods

#### Test Mode (`NODE_ENV=test`)
- Allows wildcard origin (`*`) for easier testing
- Includes proper headers and methods

#### Production Mode (`NODE_ENV=production`)
- **Strict origin checking** - requires explicit `CORS_ORIGINS` to be set
- Supports:
  - Exact origin matching (e.g., `https://app.fluxapay.com`)
  - Wildcard subdomain patterns (e.g., `*.fluxapay.com`)
  - Full wildcard (`*`) if explicitly needed
- Blocks requests without valid origin
- Logs warnings for blocked origins
- Includes credentials support
- Exposes `X-Request-ID` header for tracing
- Sets max age to 24 hours

### 4. Application Integration (`src/app.ts`)
- Replaced `app.use(cors())` with `app.use(corsMiddleware)`
- Imported new CORS middleware from `./middleware/cors.middleware`

### 5. Comprehensive Tests (`src/middleware/__tests__/cors.middleware.test.ts`)
Created 17 test cases covering:

#### Development Environment Tests
- ✅ Allows all origins in development
- ✅ Allows credentials in development  
- ✅ Includes proper methods and headers

#### Test Environment Tests
- ✅ Allows wildcard origin in test environment
- ✅ Includes proper methods and headers

#### Production Environment Tests
- ✅ Blocks all origins when CORS_ORIGINS is not set
- ✅ Allows specified origins in production
- ✅ Blocks non-specified origins in production
- ✅ Blocks missing origins in production
- ✅ Supports wildcard subdomain patterns
- ✅ Allows wildcard (*) origin when explicitly set
- ✅ Handles whitespace in CORS_ORIGINS
- ✅ Includes credentials and exposed headers

#### Preflight Request Handling Tests
- ✅ Handles OPTIONS preflight requests correctly
- ✅ Rejects preflight requests from disallowed origins

#### Edge Cases
- ✅ Handles empty origin strings
- ✅ Trims whitespace from individual origins

All tests passing: **17/17** ✅

## Usage

### Development
No configuration needed - all origins are allowed by default.

### Production
Set the `CORS_ORIGINS` environment variable:

```bash
# Single origin
CORS_ORIGINS="https://app.fluxapay.com"

# Multiple origins (comma-separated)
CORS_ORIGINS="https://app.fluxapay.com,https://dashboard.fluxapay.com"

# Wildcard subdomain pattern
CORS_ORIGINS="*.fluxapay.com"

# Full wildcard (use with caution)
CORS_ORIGINS="*"
```

## Security Features

1. **Environment-based validation**: Origins are validated based on `NODE_ENV`
2. **Explicit allowlist in production**: Forces developers to explicitly define allowed origins
3. **Warning logs**: Logs warnings when CORS_ORIGINS is not set in production
4. **Blocked origin logging**: Logs attempts from blocked origins for monitoring
5. **Wildcard support**: Supports both exact matches and wildcard patterns
6. **Credential support**: Properly handles credentials with appropriate headers

## Technical Details

### Middleware Lazy Initialization
The CORS middleware uses lazy initialization to avoid environment validation issues during testing:
- Middleware is only initialized on first use
- Allows tests to set up environment variables before CORS configuration is loaded

### Origin Matching Logic
1. Exact match check
2. Wildcard pattern matching (e.g., `*.example.com`)
3. Full wildcard support (`*`)

### Headers Configuration
```typescript
{
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Secret'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400 // 24 hours
}
```

## Migration Notes

### Before
```typescript
import cors from 'cors';
app.use(cors()); // Too permissive for production
```

### After
```typescript
import { corsMiddleware } from './middleware/cors.middleware';
app.use(corsMiddleware); // Secure, environment-aware
```

## Testing

Run the CORS middleware tests:
```bash
npm test -- cors.middleware.test.ts
```

All existing tests continue to work as the new middleware maintains backward compatibility in test mode.

## Related Issue
Fixes: [Backend] CORS: Environment-based allowlist #301
