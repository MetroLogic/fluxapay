import { describe, it, expect } from 'vitest';

// Extract routes from frontend API client
function extractApiRoutes() {
  // This would parse the api.ts file to extract routes
  // For now, we'll hardcode the known routes
  const routes = [
    // Auth
    'POST /api/merchants/signup',
    'POST /api/merchants/login',
    'POST /api/merchants/verify-otp',
    'POST /api/merchants/resend-otp',
    'POST /api/merchants/forgot-password',
    'POST /api/merchants/validate-reset-token',
    'POST /api/merchants/reset-password',
    'POST /api/merchants/logout-all',

    // Merchant
    'GET /api/merchants/me',
    'PATCH /api/merchants/me',
    'PATCH /api/merchants/me/webhook',

    // API Keys
    'POST /api/v1/keys/regenerate',
    'POST /api/merchants/keys/rotate-api-key',
    'POST /api/merchants/keys/rotate-webhook-secret',

    // Settlements
    'GET /api/v1/settlements',
    'GET /api/v1/settlements/summary',
    'GET /api/v1/settlements/:id',
    'GET /api/v1/settlements/:id/export',
    'GET /api/v1/settlements/export',

    // Payments
    'POST /api/v1/payments',
    'GET /api/v1/payments',
    'GET /api/v1/payments/:id',
    'GET /api/v1/payments/export',

    // Invoices
    'POST /api/v1/invoices',
    'GET /api/v1/invoices',
    'GET /api/v1/invoices/:id',
    'PATCH /api/v1/invoices/:id/status',

    // Webhooks
    'GET /api/v1/webhooks/logs',
    'GET /api/v1/webhooks/logs/:id',
    'POST /api/v1/webhooks/logs/:id/retry',
    'POST /api/v1/webhooks/test',

    // Dashboard
    'GET /api/v1/dashboard/overview/metrics',
    'GET /api/v1/dashboard/overview/charts',
    'GET /api/v1/dashboard/overview/activity',

    // Admin
    'GET /api/admin/merchants',
    'PATCH /api/admin/merchants/:id/status',
    'GET /api/merchants/kyc/admin/submissions',
    'GET /api/merchants/kyc/admin/:id',
    'PATCH /api/merchants/kyc/admin/:id/status',
    'POST /api/refunds',
    'GET /api/refunds',
    'GET /api/refunds/:id',
    'GET /api/v1/admin/reconciliation/summary',
    'GET /api/v1/admin/reconciliation/alerts',
    'PATCH /api/v1/admin/reconciliation/alerts/:id/resolve',
  ];

  return routes;
}

describe('Contract Tests', () => {
  it('should validate that frontend API routes exist in backend swagger', async () => {
    const apiRoutes = extractApiRoutes();

    // Fetch swagger spec from backend
    const response = await fetch('http://localhost:3001/api-docs.json');
    if (!response.ok) {
      throw new Error('Failed to fetch swagger spec');
    }
    const swaggerSpec = await response.json();

    const swaggerPaths = Object.keys(swaggerSpec.paths);

    for (const route of apiRoutes) {
      const [method, path] = route.split(' ');
      const normalizedPath = path.replace(/:\w+/g, '{id}'); // Replace :id with {id}

      expect(swaggerPaths).toContain(normalizedPath);
      expect(swaggerSpec.paths[normalizedPath]).toHaveProperty(method.toLowerCase());
    }
  });
});