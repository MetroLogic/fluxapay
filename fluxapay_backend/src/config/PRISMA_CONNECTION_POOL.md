# Prisma Connection Pool Configuration

## Overview

The application enforces a single PrismaClient singleton across all services to prevent database connection pool exhaustion. The singleton is exported from `src/config/prisma.ts` and must be imported by all services instead of creating new instances.

## Connection Pool Sizing

Pool size is configured via `DATABASE_URL` connection string parameter `connection_limit`:

```
postgresql://user:password@host:port/dbname?connection_limit=N
```

### Recommended Values by Environment

| Environment | connection_limit | Reasoning |
|---|---|---|
| **Local Dev** | 5 | Single developer, low concurrency |
| **Staging** | 20 | ~10–20 concurrent requests expected |
| **Production** | 50–100 | Scale with expected concurrent requests |

### Load Calculation Example

For production with 100 concurrent requests:
- Each request typically holds 1 connection for ~100–500ms
- Under sustained load, estimate connection_limit = concurrent_requests ÷ 2
- Example: 100 concurrent requests → connection_limit=50

## Graceful Shutdown

The singleton instance disconnects via `shutdown.service.ts` during process termination. **Never call `prisma.$disconnect()` in individual services.** The centralized shutdown handler ensures:
1. No new connections are opened after shutdown begins
2. In-flight requests drain before the connection pool closes
3. Proper SIGTERM / SIGINT handling with a 30s timeout

## Validation

- All service files import `prisma` from `../config/prisma`
- `app.ts` exports the singleton to `index.ts`
- Only `shutdown.service.ts` calls `$disconnect()`
- Tests and scripts are excluded and may create isolated instances
