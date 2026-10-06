import fs from 'fs';
import path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';

import { specs } from '../docs/swagger';

const ROUTE_FILE_MOUNT_PREFIX: Record<string, string> = {
  'addressPool.route.ts': '/admin/address-pool',
  'adminConfig.route.ts': '/admin/config',
  'adminUsage.route.ts': '/admin/usage',
  'apiKey.route.ts': '/api-keys',
  'audit.route.ts': '/admin',
  'auth.route.ts': '/auth',
  'charges.route.ts': '/charges',
  'customer.route.ts': '/customers',
  'dailyReconciliation.route.ts': '/reports/reconciliation',
  'dashboard.route.ts': '/dashboard',
  'dataExport.route.ts': '/merchants/export',
  'email.route.ts': '/email',
  'fx.route.ts': '/fx-rates',
  'invoice.route.ts': '/invoices',
  'keys.route.ts': '/keys',
  'kyc.route.ts': '/merchants/kyc',
  'merchant.route.ts': '/merchants',
  'merchantDeletion.route.ts': '/merchants',
  'password.route.ts': '/password',
  'payment.route.ts': '/payments',
  'paymentLink.route.ts': '/payment-links',
  'reconciliation.route.ts': '/admin/reconciliation',
  'refund.route.ts': '/refunds',
  'settlement.route.ts': '/settlements',
  'settlementBatch.route.ts': '/admin/settlement',
  'sweep.route.ts': '/admin/sweep',
  'system.route.ts': '/admin/system',
  'usage.route.ts': '/merchants',
  'webhook.route.ts': '/webhooks',
};

const ROUTE_FILE_FULL_MOUNT_PREFIX: Record<string, string> = {
  'health.route.ts': '/health',
};

const normalizePathForMatch = (route: string): string =>
  route
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '{param}')
    .replace(/\{[^}]+\}/g, '{param}');

const expressRouteToOpenApiPath = (file: string, routePath: string): string => {
  const suffix = routePath === '/' ? '' : routePath;

  if (ROUTE_FILE_FULL_MOUNT_PREFIX[file]) {
    return `${ROUTE_FILE_FULL_MOUNT_PREFIX[file]}${suffix}`;
  }

  const mount = ROUTE_FILE_MOUNT_PREFIX[file] ?? '';
  return `/api/v1${mount}${suffix}`;
};

const collectDocumentedRoutes = (): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();

  Object.entries((specs as any).paths || {}).forEach(([swaggerPath, pathItem]) => {
    if (!pathItem) {
      return;
    }

    ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].forEach((method) => {
      if ((pathItem as any)[method]) {
        const normalizedPath = normalizePathForMatch(swaggerPath);
        if (!map.has(normalizedPath)) {
          map.set(normalizedPath, new Set());
        }
        map.get(normalizedPath)?.add(method.toUpperCase());
      }
    });
  });

  return map;
};

describe('OpenAPI Swagger specification', () => {
  it('compiles as a valid OpenAPI 3.0 document', async () => {
    expect(specs).toBeDefined();
    expect((specs as any).openapi).toMatch(/^3\./);
    expect((specs as any).info).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        version: expect.any(String),
      }),
    );
    expect((specs as any).paths).toBeDefined();
    expect(Object.keys((specs as any).paths ?? {})).not.toHaveLength(0);

    await expect(SwaggerParser.validate(specs as any)).resolves.toBeDefined();
  });

  it('documents every registered API route', () => {
    const routesDir = path.join(__dirname, '../routes');
    const documented = collectDocumentedRoutes();
    const undocumented: string[] = [];

    fs.readdirSync(routesDir)
      .filter((file) => file.endsWith('.route.ts'))
      .forEach((file) => {
        const filePath = path.join(routesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const routePattern = /router\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`](.*?)['"`]/g;

        for (const match of content.matchAll(routePattern)) {
          const [, method, routePath] = match;
          const fullPath = expressRouteToOpenApiPath(file, routePath);
          const normalizedFull = normalizePathForMatch(fullPath);
          const withoutApiPrefix = fullPath.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
          const normalizedShort = normalizePathForMatch(withoutApiPrefix);

          const hasDocs =
            documented.get(normalizedFull)?.has(method.toUpperCase()) ||
            documented.get(normalizedShort)?.has(method.toUpperCase());

          if (!hasDocs) {
            undocumented.push(`${method.toUpperCase()} ${routePath} (${file})`);
          }
        }
      });

    expect(undocumented).toEqual([]);
  });
});
