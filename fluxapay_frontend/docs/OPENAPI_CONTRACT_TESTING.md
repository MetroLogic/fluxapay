# OpenAPI Contract Testing Guide

This guide explains how to use the OpenAPI contract testing tools to ensure your API documentation stays in sync with implementation.

## Overview

FluxaPay uses OpenAPI 3.0.0 specifications to document the API. The contract testing suite includes:

1. **OpenAPI Spec Validator** - Validates syntax and structure
2. **Contract Tests** - Runtime response validation
3. **Route Coverage Checker** - Identifies undocumented endpoints
4. **Breaking Change Detector** - Detects breaking changes between versions

## Quick Start

### Run All Checks Locally

```bash
# Navigate to backend directory
cd fluxapay_backend

# Validate OpenAPI specification
npm run validate:openapi

# Check route documentation coverage
npm run check:route-coverage

# Run contract tests
npm run test:contract

# Detect breaking changes (compares with main branch)
npm run detect-breaking-changes
```

## Available Commands

| Command | Description | Exit Code on Failure |
|---------|-------------|---------------------|
| `npm run validate:openapi` | Validates OpenAPI spec syntax and structure | 1 |
| `npm run check:route-coverage` | Checks if all routes have Swagger docs | 0 (warnings only) |
| `npm run check:route-coverage -- --ci` | CI mode - fails on undocumented routes | 1 |
| `npm run test:contract` | Runs OpenAPI contract tests | 1 |
| `npm run detect-breaking-changes` | Detects breaking changes vs main | 1 (if critical) |

## Adding New Endpoint Documentation

When adding new API endpoints, follow these steps:

### 1. Add JSDoc Swagger Annotations

In your route file (e.g., `src/routes/payment.route.ts`):

```typescript
/**
 * @swagger
 * /api/v1/payments:
 *   post:
 *     summary: Create payment intent
 *     description: Creates a new payment intent for the authenticated merchant
 *     tags: [Payments]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       201:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: pay_123
 *                 amount:
 *                   type: number
 *                   example: 100.5
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', authenticateApiKey, validatePayment, createPayment);
```

### 2. Define Reusable Schemas

In `src/docs/swagger.ts`, add schemas to the components section:

```typescript
schemas: {
  CreatePaymentRequest: {
    type: 'object',
    required: ['amount', 'currency', 'customer_email'],
    properties: {
      amount: { type: 'number', example: 100.5 },
      currency: { type: 'string', example: 'USDC' },
      customer_email: { type: 'string', format: 'email' },
    },
  },
},
```

### 3. Verify Documentation

Run the coverage checker:

```bash
npm run check:route-coverage
```

You should see your new endpoint listed as documented ✅.

## Understanding Test Failures

### OpenAPI Validation Errors

**Error**: `Missing required field: info.title`

**Fix**: Ensure your `src/docs/swagger.ts` has all required fields:
- `openapi` version
- `info.title`
- `info.version`
- `paths`

### Contract Test Failures

**Error**: 
```
❌ OpenAPI Contract Violation for POST /api/v1/payments
   Status Code: 201
   Error 1:
     Message: Response has missing required property: id
     Path: /body/id
```

**Fix**: Your controller is returning a response that doesn't match the documented schema. Either:
1. Update the controller to return the expected fields
2. Update the Swagger documentation to match the actual response

### Route Coverage Warnings

**Warning**: `Missing summary for POST /api/v1/payments`

**Fix**: Add a `summary` field to your JSDoc annotation. While not breaking, good documentation includes:
- `summary` - Brief one-liner
- `description` - Detailed explanation
- `tags` - For grouping in Swagger UI
- `operationId` - For SDK generation

## CI Integration

The GitHub Actions workflow (`.github/workflows/backend-ci.yml`) runs:

```yaml
- name: Validate OpenAPI Specification
  run: npm run validate:openapi

- name: Check Route Documentation Coverage
  run: npm run check:route-coverage -- --ci

- name: Run Contract Tests
  run: npm run test:contract
```

**CI will fail if:**
- OpenAPI spec has syntax errors
- Routes are undocumented (in --ci mode)
- Contract tests detect schema mismatches

## Breaking Change Detection

The breaking change detector compares your current spec against the main branch:

```bash
# Compare with main
npm run detect-breaking-changes

# Compare with specific tag/commit
npm run detect-breaking-changes --ref=v1.2.0
```

### Detected Breaking Changes

**Critical** (Will block deployment):
- Removed endpoints
- Removed HTTP methods
- Removed authentication requirements

**Major** (Version bump recommended):
- Removed required parameters
- Changed parameter types
- Removed enum values
- Added authentication requirements

**Minor** (Informational):
- Made fields optional
- Added optional parameters
- Added new endpoints

## Troubleshooting

### "Cannot find module 'openapi-response-validator'"

Run `npm install` to install dependencies.

### Contract tests failing with "Path not found in spec"

Your route path in the code doesn't match the Swagger path. Make sure:
- Path parameters use the same format (`:id` in code = `{id}` in Swagger)
- Base paths match exactly

### Schema dereferencing fails

Check for circular references in your schemas or invalid `$ref` pointers.

### Tests timeout

Contract tests start a real server. If they timeout:
- Increase Jest timeout in `jest.config.js`
- Check for database connection issues
- Ensure test cleanup in `afterAll`

## Best Practices

1. **Document as you code** - Add Swagger annotations when creating routes
2. **Use `$ref` for consistency** - Reference shared schemas instead of duplicating
3. **Include error responses** - Document 400, 401, 404, 500 responses
4. **Provide examples** - Help API consumers with realistic examples
5. **Keep descriptions updated** - Update docs when changing behavior
6. **Run checks before committing** - Catch issues early

## Example: Complete Endpoint Documentation

```typescript
// 1. Define schema in src/docs/swagger.ts
schemas: {
  PaymentResponse: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'pay_123' },
      amount: { type: 'number', example: 100.5 },
      currency: { type: 'string', example: 'USDC' },
      status: { 
        type: 'string', 
        enum: ['pending', 'confirmed', 'failed'],
        example: 'pending'
      },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
}

// 2. Add JSDoc to route
/**
 * @swagger
 * /api/v1/payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Payments]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentResponse'
 *       404:
 *         description: Payment not found
 */
router.get('/:id', authenticateApiKey, getPaymentById);

// 3. Ensure controller returns matching response
export const getPaymentById = async (req: Request, res: Response) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
  });
  
  // Return shape matches PaymentResponse schema
  res.json({
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    created_at: payment.createdAt.toISOString(),
  });
};
```

## Additional Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Swagger JS Docs](https://github.com/Surnet/swagger-jsdoc)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)

## Questions?

If you encounter issues not covered here, check:
1. Existing route files for examples (`payment.route.ts`, `merchant.route.ts`)
2. Swagger output at `/api-docs` (when running dev server)
3. CI logs for detailed error messages
