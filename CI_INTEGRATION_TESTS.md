# CI Integration Tests Documentation

## Overview

This document describes the CI integration testing setup for FluxaPay, which prevents route drift between frontend and backend through automated testing.

## Technical Requirements Met

✅ **Spin up PostgreSQL + Backend** - Docker Compose configuration for CI  
✅ **Run backend tests and API smoke tests** - Comprehensive test suite  
✅ **Run frontend build and E2E subset** - Smoke tests for critical paths  

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CI Pipeline (GitHub Actions)              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │   Backend Job    │    │  Frontend Job    │               │
│  │                  │    │                  │               │
│  │  1. PostgreSQL   │    │  1. Build        │               │
│  │  2. Unit Tests   │    │  2. Unit Tests   │               │
│  │  3. Build        │    │  3. E2E Smoke    │               │
│  │  4. Start Server │    │                  │               │
│  │  5. Smoke Tests  │    │                  │               │
│  └──────────────────┘    └──────────────────┘               │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │       Route Drift Detection              │               │
│  │  - Extract backend routes                │               │
│  │  - Extract frontend API calls            │               │
│  │  - Compare and report mismatches         │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Files Created

### CI/CD Configuration

1. **`.github/workflows/integration-tests.yml`**
   - Main CI workflow for integration tests
   - Runs on push to main and pull requests
   - Three parallel jobs: Backend, Frontend, Route Drift
   - Summary job with pass/fail status

2. **`docker-compose.ci.yml`**
   - PostgreSQL service for backend tests
   - Backend service with health checks
   - Ephemeral storage for fast CI runs

3. **`fluxapay_backend/Dockerfile.ci`**
   - Optimized Dockerfile for CI builds
   - Fast build times with layered caching

### Backend Tests

4. **`fluxapay_backend/src/tests/api.smoke.test.ts`**
   - API endpoint availability checks
   - Health check verification
   - Request ID middleware tests
   - CORS header verification
   - Route drift detection for critical endpoints

5. **`fluxapay_backend/package.json`** (modified)
   - Added `test:smoke` script
   - Added `test:integration` script
   - Added `supertest` dependency

### Frontend Tests

6. **`fluxapay_frontend/playwright.smoke.config.ts`**
   - Playwright configuration for smoke tests
   - Filters tests with `@smoke` tag
   - Optimized for CI execution

7. **`fluxapay_frontend/e2e/smoke.spec.ts`**
   - Critical path E2E tests
   - Home page load
   - Login/signup validation
   - API connectivity checks
   - Navigation tests
   - Mobile responsive check

8. **`fluxapay_frontend/e2e/login.spec.ts`** (modified)
   - Added `@smoke` tags to critical tests

9. **`fluxapay_frontend/package.json`** (modified)
   - Added `test:e2e:smoke` script

### Route Drift Detection

10. **`scripts/detect-route-drift.js`**
    - Extracts routes from backend route files
    - Extracts API calls from frontend source
    - Compares and identifies mismatches
    - Generates markdown report

11. **`package.json`** (root, modified)
    - Added `detect-route-drift` script
    - Added CI helper scripts

## Usage

### Local Testing

```bash
# Run backend smoke tests
cd fluxapay_backend
npm run test:smoke

# Run frontend smoke tests
cd fluxapay_frontend
npm run test:e2e:smoke

# Run route drift detection
cd ../
npm run detect-route-drift
```

### CI Execution

The integration tests run automatically on:
- Push to `main` branch
- Pull requests to `main`

### Manual CI Trigger

```bash
# Setup CI environment
npm run ci:setup

# Run tests
npm run test:backend
npm run test:frontend
npm run test:smoke

# Teardown
npm run ci:teardown
```

## Test Coverage

### Backend Smoke Tests

| Test Category | Tests | Description |
|---------------|-------|-------------|
| Health Check | 1 | API health endpoint |
| API Documentation | 2 | Swagger UI and JSON |
| Core Endpoints | 12 | All major route availability |
| Authentication | 3 | Protected endpoint checks |
| Middleware | 2 | Request ID, CORS |
| Error Handling | 2 | 404 and error responses |
| Metrics | 1 | Metrics endpoint |
| Route Drift | 5 | Critical route verification |

### Frontend Smoke Tests

| Test Category | Tests | Description |
|---------------|-------|-------------|
| Page Load | 1 | Home page loads |
| Login | 2 | Login form and validation |
| Signup | 1 | Signup form validation |
| API Check | 1 | Frontend-backend connectivity |
| Auth | 1 | Dashboard requires auth |
| Navigation | 1 | Link navigation works |
| Responsive | 1 | Mobile viewport check |
| Console Errors | 1 | No JS errors on load |

### Route Drift Detection

| Check | Description |
|-------|-------------|
| Critical Routes | 10 required routes verified |
| Backend Routes | All routes from `src/routes/` |
| Frontend Calls | All API calls from `src/` |
| Method Mismatch | HTTP method consistency |
| Missing Routes | Routes in one but not other |

## Critical Routes

These routes are verified to exist in both frontend and backend:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/merchants` | Merchant registration |
| POST | `/api/v1/merchants/login` | Merchant login |
| GET | `/api/v1/merchants/me` | Get current merchant |
| POST | `/api/v1/payments` | Create payment |
| GET | `/api/v1/payments` | List payments |
| POST | `/api/v1/refunds` | Create refund |
| GET | `/api/v1/refunds` | List refunds |
| POST | `/api/v1/merchants/kyc` | Submit KYC |
| GET | `/api/v1/dashboard` | Dashboard data |
| GET | `/health` | Health check |

## CI Workflow Details

### Backend Integration Job

```yaml
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Generate Prisma client
5. Run unit tests (with PostgreSQL)
6. Build application
7. Start server
8. Run API smoke tests
9. Upload test results
```

### Frontend Integration Job

```yaml
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Install Playwright browsers
5. Run linting
6. Build application
7. Run unit tests
8. Start server
9. Run E2E smoke tests
10. Upload test results & Playwright report
```

### Route Drift Detection Job

```yaml
1. Checkout code
2. Install dependencies (backend & frontend)
3. Extract backend routes
4. Extract frontend API calls
5. Compare routes
6. Generate drift report
7. Upload report
```

## Test Results

### Artifacts

Test results are uploaded as GitHub Actions artifacts:

- `backend-test-results` - Backend test output
- `frontend-test-results` - Frontend test output
- `playwright-report` - HTML Playwright report
- `route-drift-report` - Route drift analysis

### Viewing Results

1. Go to GitHub Actions workflow run
2. Scroll to "Artifacts" section
3. Download desired artifact
4. Open HTML reports in browser

## Troubleshooting

### Backend Tests Fail

**Issue**: PostgreSQL connection error

**Solution**:
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection string
echo $DATABASE_URL
```

### Frontend Tests Fail

**Issue**: Playwright browser not found

**Solution**:
```bash
# Install browsers
cd fluxapay_frontend
npx playwright install --with-deps chromium
```

### Route Drift Detected

**Issue**: Critical route missing

**Solution**:
1. Review `route-drift-report.md`
2. Add missing route to backend or frontend
3. Re-run tests

### Timeout Issues

**Issue**: Tests timeout in CI

**Solution**:
- Increase timeout in Playwright config
- Check server health check timing
- Verify `wait-on` timeout is sufficient

## Performance Optimization

### Build Times

- **Backend**: ~2-3 minutes (with cached dependencies)
- **Frontend**: ~3-4 minutes (with cached dependencies)
- **Route Drift**: ~30 seconds

### Optimization Tips

1. **Cache Dependencies**: Uses `actions/setup-node` cache
2. **Parallel Jobs**: Backend, Frontend, and Drift run in parallel
3. **Ephemeral DB**: PostgreSQL uses tmpfs for fast I/O
4. **Smoke Tests**: Only critical E2E tests run in CI

## Adding New Tests

### Backend Smoke Tests

```typescript
// fluxapay_backend/src/tests/api.smoke.test.ts
describe('New Feature', () => {
  it('should respond to new endpoint', async () => {
    const response = await request(API_BASE_URL)
      .get('/api/v1/new-feature');
    
    expect([200, 401, 403]).toContain(response.status);
  });
});
```

### Frontend Smoke Tests

```typescript
// fluxapay_frontend/e2e/smoke.spec.ts
test('@smoke - New feature works', async ({ page }) => {
  await page.goto('/en/new-feature');
  await expect(page.getByText(/feature name/i)).toBeVisible();
});
```

### Critical Routes

Add to `scripts/detect-route-drift.js`:

```javascript
const CRITICAL_ROUTES = [
  // ... existing routes
  { method: 'GET', path: '/api/v1/new-feature', description: 'New feature' },
];
```

## Monitoring

### GitHub Actions Status Badge

Add to README.md:

```markdown
[![Integration Tests](https://github.com/MetroLogic/fluxapay/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/MetroLogic/fluxapay/actions/workflows/integration-tests.yml)
```

### Test Coverage Trends

View test coverage trends in GitHub Actions → Workflow runs → Test summary

## Best Practices

1. **Tag Critical Tests**: Use `@smoke` for tests that must pass in CI
2. **Mock External Services**: Don't rely on external APIs in CI
3. **Keep Tests Fast**: Smoke tests should complete in < 5 minutes
4. **Deterministic Tests**: Avoid flaky tests that fail randomly
5. **Clear Error Messages**: Make failures easy to debug

## Future Enhancements

### Planned Improvements

1. **Visual Regression**: Add screenshot comparison for UI changes
2. **Performance Tests**: Add Lighthouse CI for performance monitoring
3. **API Contract Tests**: OpenAPI schema validation
4. **Canary Deployments**: Run tests against staging before production
5. **Test Parallelization**: Split tests across multiple runners

### Optional Additions

- **Slack Notifications**: Post test results to Slack
- **Test Analytics**: Integrate with test reporting services
- **Auto-retry**: Automatic retry for flaky tests
- **Coverage Reports**: Upload coverage to Codecov/Coveralls

## Related Documentation

- **Backend Testing**: `fluxapay_backend/README.md`
- **Frontend Testing**: `fluxapay_frontend/README.md`
- **Playwright Docs**: `fluxapay_frontend/playwright.config.ts`
- **GitHub Actions**: `.github/workflows/`

## Support

For issues with CI integration tests:

1. Check workflow run logs
2. Download test artifacts
3. Review route drift report
4. Re-run failed jobs
5. Contact dev team if issues persist

## Summary

This CI integration test setup provides:

✅ **Automated Testing** - Runs on every PR and push  
✅ **Route Drift Prevention** - Detects frontend/backend mismatches  
✅ **Fast Feedback** - Smoke tests complete in < 10 minutes  
✅ **Comprehensive Coverage** - Backend, frontend, and E2E tests  
✅ **Clear Reporting** - Test results and drift reports uploaded  

The system ensures that frontend and backend stay in sync and critical functionality always works.
