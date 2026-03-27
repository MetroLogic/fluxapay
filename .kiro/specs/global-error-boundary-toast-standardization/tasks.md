# Implementation Plan: Global Error Boundary & Toast Standardization

## Overview

Implement a layered error-handling architecture for the FluxaPay frontend:
1. A `GlobalErrorBoundary` React class component wrapping the app tree
2. A `toastApiError` / `toastApiErrorWithRetry` utility in `src/lib/toastApiError.ts`
3. Updated `Providers` wiring both together with SWR global error config
4. Migration of existing `toast.error` call sites to use the new utility

## Tasks

- [x] 1. Create the `toastApiError` utility module
  - Create `src/lib/toastApiError.ts` exporting `toastApiError(error: unknown): void` and `toastApiErrorWithRetry(error: unknown, onRetry: () => void): void`
  - Implement `resolveMessage` with the status-code switch: 401 → "Session expired. Please sign in again.", 403 → "You do not have permission to perform this action.", 404 → "The requested resource was not found.", 429 → "Too many requests. Please wait a moment and try again.", ≥500 → "A server error occurred. Please try again later.", other `ApiError` → `error.message`, non-`ApiError` → "An unexpected error occurred."
  - `toastApiError` calls `toast.error(resolveMessage(error))`
  - `toastApiErrorWithRetry` renders a custom toast with a "Retry" button (calling `onRetry` then `toast.dismiss`) for retryable statuses (429, ≥500) and non-`ApiError` values; falls back to plain `toast.error` for 401, 403, 404
  - Wrap all logic in try/catch so the utility itself never throws
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 1.1 Write property test: defined status codes map to exact messages (Property 3)
    - **Property 3: Defined status codes map to exact messages**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 6.1**
    - File: `src/lib/__tests__/toastApiError.property.test.ts`
    - Use `fc.integer({ min: 500, max: 599 })` to verify all 5xx codes map to the server error message
    - Assert each of 401, 403, 404, 429 maps to its exact string
    - `numRuns: 100`

  - [ ]* 1.2 Write property test: unmapped ApiError status falls through to error.message (Property 4)
    - **Property 4: Unmapped ApiError status falls through to error.message**
    - **Validates: Requirements 2.7, 6.2**
    - File: `src/lib/__tests__/toastApiError.property.test.ts`
    - Use `fc.integer({ min: 100, max: 499 }).filter(s => ![401,403,404,429].includes(s))` with `fc.string({ minLength: 1 })`
    - Assert `toast.error` is called with the `ApiError`'s own `message`
    - `numRuns: 100`

  - [ ]* 1.3 Write property test: non-ApiError values produce the generic fallback message (Property 5)
    - **Property 5: Non-ApiError values produce the generic fallback message**
    - **Validates: Requirements 2.8**
    - File: `src/lib/__tests__/toastApiError.property.test.ts`
    - Use `fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined))`
    - Assert `toast.error` is called with "An unexpected error occurred."
    - `numRuns: 100`

  - [ ]* 1.4 Write property test: retry button presence matches retryability (Property 6)
    - **Property 6: Retry button presence matches retryability of the error**
    - **Validates: Requirements 3.2, 3.4, 3.5**
    - File: `src/lib/__tests__/toastApiError.property.test.ts`
    - Use `fc.integer({ min: 500, max: 599 })` for retryable; `fc.constantFrom(401, 403, 404)` for non-retryable
    - Assert toast render function includes/excludes "Retry" button accordingly
    - `numRuns: 100`

  - [ ]* 1.5 Write property test: each toastApiError call produces an independent toast (Property 7)
    - **Property 7: Each toastApiError call produces an independent toast**
    - **Validates: Requirements 6.3**
    - File: `src/lib/__tests__/toastApiError.property.test.ts`
    - Use `fc.integer({ min: 1, max: 10 })` for call count N; assert `toast.error` called exactly N times
    - `numRuns: 100`

  - [ ]* 1.6 Write unit tests for toastApiError call sites and retry interaction
    - File: `src/lib/__tests__/toastApiError.test.ts`
    - Example 2.1: assert `toastApiError` is exported and callable
    - Example 3.1: assert `toastApiErrorWithRetry` is exported and callable
    - Example 3.3: call `toastApiErrorWithRetry` with a 500 error; render the toast; click "Retry"; assert `onRetry` was called and `toast.dismiss` was called
    - _Requirements: 2.1, 3.1, 3.3_

- [x] 2. Create the `GlobalErrorBoundary` component
  - Create `src/components/GlobalErrorBoundary.tsx` as a React class component with `Props { children: ReactNode }` and `State { hasError: boolean; error: Error | null }`
  - Implement `static getDerivedStateFromError` returning `{ hasError: true, error }`
  - Implement `componentDidCatch(error, info)` calling `console.error(error, info)`
  - Implement `handleReset()` resetting state to `{ hasError: false, error: null }`
  - Render fallback UI inline when `hasError`: heading "Something went wrong", message "An unexpected error occurred. You can try refreshing the page.", and a "Try again" button calling `handleReset()`
  - Render `this.props.children` when no error
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 2.1 Write property test: error boundary catches any render error (Property 1)
    - **Property 1: Error boundary catches any render error**
    - **Validates: Requirements 1.2**
    - File: `src/components/__tests__/GlobalErrorBoundary.property.test.tsx`
    - Use `fc.string()` as the error message; throw `Error(msg)` from a child component; assert fallback contains "Something went wrong"
    - `numRuns: 100`

  - [ ]* 2.2 Write property test: error boundary is transparent when no error occurs (Property 2)
    - **Property 2: Error boundary is transparent when no error occurs**
    - **Validates: Requirements 1.7**
    - File: `src/components/__tests__/GlobalErrorBoundary.property.test.tsx`
    - Use `fc.string()` as child text content; assert it appears in rendered output with no extra wrapper nodes
    - `numRuns: 100`

  - [ ]* 2.3 Write unit tests for GlobalErrorBoundary
    - File: `src/components/__tests__/GlobalErrorBoundary.test.tsx`
    - Example 1.3: throw from child; assert fallback contains "Something went wrong"
    - Example 1.4+1.5: throw from child; click "Try again"; assert children remount (original content visible)
    - Example 1.6: throw from child; assert `console.error` was called with the error and component stack
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update `Providers` to wire `GlobalErrorBoundary` and `SWRConfig`
  - Modify `src/app/providers.tsx` to import `GlobalErrorBoundary` and `SWRConfig` from `swr`
  - Wrap children in `<GlobalErrorBoundary>` as the outer wrapper
  - Wrap children in `<SWRConfig value={{ onError: (error) => toastApiError(error) }}>` as the inner wrapper
  - Do not suppress or return a value from `onError` — preserve SWR's default error state
  - _Requirements: 1.1, 4.1, 4.2, 4.3_

  - [ ]* 4.1 Write unit tests for Providers SWR wiring
    - File: `src/app/__tests__/providers.test.tsx`
    - Example 4.1: render `<Providers>` and assert `SWRConfig` is present with an `onError` prop
    - Example 4.2: trigger the `onError` callback; assert `toastApiError` was called with the same error
    - Example 4.3: trigger a SWR fetch error; assert the `error` field from `useSWR` is still populated after the toast fires
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Migrate existing `toast.error` call sites to use `toastApiError`
  - Replace `toast.error(...)` calls that handle caught errors (ApiError or generic Error) with `toastApiError(error)` or `toastApiErrorWithRetry(error, onRetry)` in the following files:
    - `src/features/auth/components/LoginForm.tsx` — replace hardcoded `toast.error("Unable to sign in right now. Please try again.")`
    - `src/features/auth/components/SignUpForm.tsx` — replace the caught-error `toast.error(message)` call
    - `src/app/dashboard/payments/page.tsx` — replace both caught-error `toast.error(message)` calls (payment link creation and refund submission); use `toastApiErrorWithRetry` for the refund submission
    - `src/app/dashboard/webhooks/page.tsx` — replace caught-error `toast.error`
    - `src/features/webhooks/WebhookTest.tsx` — replace caught-error `toast.error`
    - `src/features/webhooks/WebhookDetails.tsx` — replace both caught-error `toast.error` calls; use `toastApiErrorWithRetry` for the retry action
    - `src/features/dashboard/components/overview/QuickActions.tsx` — replace caught-error `toast.error`
    - `src/app/admin/kyc/page.tsx` — replace caught-error `toast.error("Failed to update application status")`
    - `src/app/admin/merchants/page.tsx` — replace all three caught-error `toast.error` calls
  - Retain all `toast.success` calls unchanged
  - Retain validation-guard `toast.error` calls that are not handling caught errors (e.g., "Please enter a valid amount.", "Please select both start and end dates", "Please provide a reason for rejection", "No logs to export") — these are input validation messages, not API error responses
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- `fast-check` must be added as a dev dependency before running property tests: `npm install --save-dev fast-check` (run inside `fluxapay_frontend/`)
- Each property test file must include the tag comment: `// Feature: global-error-boundary-toast-standardization, Property N: <property_text>`
- Property tests must use `{ numRuns: 100 }` explicitly
- `toast.error` calls that guard input validation (not caught errors) are intentionally excluded from migration per Requirements 5.2 and 5.3
