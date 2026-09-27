import express from 'express';
import request from 'supertest';
import { specs } from '../../docs/swagger';
import { requestIdMiddleware } from '../../middleware/requestId.middleware';

describe('request ID response header', () => {
  const app = express();

  beforeAll(() => {
    app.use(requestIdMiddleware);
    app.get('/success', (_req, res) => res.status(200).json({ status: 'ok' }));
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
