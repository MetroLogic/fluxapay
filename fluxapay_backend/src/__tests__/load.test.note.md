# Load Test Note: 100 Concurrent Requests

## Scenario

Test that the Prisma singleton connection pool does not exhaust when handling 100 concurrent HTTP requests.

## Setup

This test validates the singleton pattern under realistic load:

```typescript
// Pseudo-code: do not run
import request from 'supertest';
import { app } from '../app';

describe('Connection Pool - 100 Concurrent Requests', () => {
  it('should handle 100 concurrent requests without pool exhaustion', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      request(app)
        .get('/health')
        .expect(200)
    );
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    expect(results.every(r => r.status === 200)).toBe(true);
  });
  
  it('should drain connection pool within graceful shutdown timeout', async () => {
    // Start 50 concurrent requests
    // Trigger SIGTERM
    // Verify all requests complete within SHUTDOWN_TIMEOUT_MS (default 30s)
  });
});
```

## Notes

- Do NOT run this test automatically in CI/CD (requires database scaling)
- Run manually during pre-release testing with production-like connection_limit
- Monitor `pg_stat_activity` to verify connection count peaks below connection_limit
- Verify no "too many connections" errors in logs

## Related

- See `PRISMA_CONNECTION_POOL.md` for pool sizing recommendations
- See `shutdown.service.ts` for graceful drain implementation
