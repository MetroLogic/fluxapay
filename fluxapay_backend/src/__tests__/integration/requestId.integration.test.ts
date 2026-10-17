import express from 'express';
import request from 'supertest';
import { specs } from '../../docs/swagger';
import { requestIdMiddleware } from '../../middleware/requestId.middleware';
import { getLogger } from '../../utils/logger';
import { requestContextStorage } from '../../utils/requestContext';

describe('request ID response header', () => {
  const app = express();

  beforeAll(() => {
    app.use(requestIdMiddleware);
    app.get('/success', (_req, res) => res.status(200).json({ status: 'ok' }));
    app.get('/context', async (_req, res) => {
      await new Promise((resolve) => setImmediate(resolve));
      getLogger().info('Correlation context test');
      res.json({ correlationId: requestContextStorage.getStore()?.correlationId });
    });
    app.get('/error', (_req, _res, next) => next(new Error('test error')));
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ message: error.message });
    });
  });

  it.each([
    ['/success', 200],
    ['/error', 500],
  ])('includes the request ID header on %s responses', async (path, status) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(status);
    expect(response.headers['x-fluxapay-request-id']).toBeTruthy();
    expect(response.headers['x-fluxapay-request-id']).toBe(response.headers['x-request-id']);
  });

  it('generates and propagates a UUIDv4 correlation ID through async context', async () => {
    const response = await request(app).get('/context');

    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
  });

  it('uses a supplied correlation ID in response headers and structured logs', async () => {
    const logOutput = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      const response = await request(app)
        .get('/context')
        .set('X-Correlation-ID', 'corr-client-123');

      expect(response.headers['x-correlation-id']).toBe('corr-client-123');
      expect(response.body.correlationId).toBe('corr-client-123');
      const log = JSON.parse(logOutput.mock.calls[0][0] as string);
      expect(log.correlationId).toBe('corr-client-123');
      expect(log.context.correlationId).toBe('corr-client-123');
    } finally {
      logOutput.mockRestore();
    }
  });

  it('documents the request ID header on every OpenAPI response', () => {
    const documentedHeaders: unknown[] = [];

    for (const pathItem of Object.values(specs.paths ?? {})) {
      for (const operation of Object.values(pathItem ?? {})) {
        if (!operation || typeof operation !== 'object' || !('responses' in operation)) {
          continue;
        }

        for (const response of Object.values(operation.responses ?? {})) {
          documentedHeaders.push(
            response && typeof response === 'object'
              ? response.headers?.['X-FluxaPay-Request-ID']
              : undefined,
          );
        }
      }
    }

    expect(documentedHeaders.length).toBeGreaterThan(0);
    expect(documentedHeaders.every((header) =>
      header && typeof header === 'object' && '$ref' in header &&
      header.$ref === '#/components/headers/FluxaPayRequestId',
    )).toBe(true);
  });
});
