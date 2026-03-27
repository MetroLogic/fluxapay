# Requirements Document

## Introduction

This feature adds a global error boundary and standardizes toast notifications across the FluxaPay frontend. Currently, the app has no React error boundary, meaning unhandled render errors crash the entire UI with no recovery path. Toast usage is also inconsistent — some components use hardcoded strings, some use generic messages, and some have no error handling at all. This feature addresses both gaps: a top-level error boundary that catches unexpected render failures and presents a recoverable UI, and a centralized error-to-toast utility that maps `ApiError` status codes to consistent, human-readable messages with retry CTAs where appropriate.

## Glossary

- **Error_Boundary**: A React class component that catches JavaScript errors in its child component tree and renders a fallback UI instead of crashing the page.
- **ApiError**: The existing error class in `src/lib/api.ts` with `status: number` and `message: string` properties, thrown by `fetchWithAuth` on non-ok HTTP responses.
- **Toast**: A transient notification rendered via `react-hot-toast`.
- **Toast_Utility**: A centralized module that maps `ApiError` instances (and generic `Error` objects) to standardized toast messages.
- **Retry_CTA**: A call-to-action rendered within a toast or fallback UI that allows the user to re-attempt a failed operation.
- **Fallback_UI**: The UI rendered by the Error_Boundary when an unhandled render error is caught.
- **Providers**: The existing `src/app/providers.tsx` client component that wraps the application tree.
- **SWR**: The data-fetching library used throughout the app; its `onError` global config is the integration point for standardized API error toasts.

---

## Requirements

### Requirement 1: Global Error Boundary

**User Story:** As a user, I want the application to recover gracefully from unexpected JavaScript errors, so that a single broken component does not crash the entire page.

#### Acceptance Criteria

1. THE Error_Boundary SHALL wrap the full application component tree rendered inside `Providers`.
2. WHEN an unhandled JavaScript error is thrown during rendering, THE Error_Boundary SHALL catch the error and render the Fallback_UI instead of propagating the crash.
3. WHEN the Fallback_UI is displayed, THE Error_Boundary SHALL render a visible error message informing the user that something went wrong.
4. WHEN the Fallback_UI is displayed, THE Error_Boundary SHALL render a Retry_CTA button that resets the error boundary state and re-renders the application tree.
5. WHEN the Retry_CTA is activated, THE Error_Boundary SHALL reset its internal error state, causing the child component tree to remount.
6. IF an error is caught by the Error_Boundary, THEN THE Error_Boundary SHALL call `console.error` with the error and its component stack for observability.
7. THE Error_Boundary SHALL NOT interfere with normal rendering when no error has occurred.

---

### Requirement 2: Centralized Toast Utility

**User Story:** As a developer, I want a single utility function for displaying API error toasts, so that error messages are consistent and I do not need to write per-component error handling logic.

#### Acceptance Criteria

1. THE Toast_Utility SHALL export a function `toastApiError(error: unknown): void` that accepts any thrown value.
2. WHEN `toastApiError` is called with an `ApiError` whose `status` is 401, THE Toast_Utility SHALL display a toast with the message "Session expired. Please sign in again."
3. WHEN `toastApiError` is called with an `ApiError` whose `status` is 403, THE Toast_Utility SHALL display a toast with the message "You do not have permission to perform this action."
4. WHEN `toastApiError` is called with an `ApiError` whose `status` is 404, THE Toast_Utility SHALL display a toast with the message "The requested resource was not found."
5. WHEN `toastApiError` is called with an `ApiError` whose `status` is 429, THE Toast_Utility SHALL display a toast with the message "Too many requests. Please wait a moment and try again."
6. WHEN `toastApiError` is called with an `ApiError` whose `status` is 500 or greater, THE Toast_Utility SHALL display a toast with the message "A server error occurred. Please try again later."
7. WHEN `toastApiError` is called with an `ApiError` whose `status` does not match any defined mapping, THE Toast_Utility SHALL display a toast using the `ApiError`'s `message` property.
8. WHEN `toastApiError` is called with a non-`ApiError` value, THE Toast_Utility SHALL display a toast with the message "An unexpected error occurred."
9. THE Toast_Utility SHALL use `toast.error` from `react-hot-toast` for all error toasts.

---

### Requirement 3: Retry CTA in Error Toasts

**User Story:** As a user, I want to retry a failed action directly from the error notification, so that I can recover from transient failures without manually repeating the action.

#### Acceptance Criteria

1. THE Toast_Utility SHALL export a function `toastApiErrorWithRetry(error: unknown, onRetry: () => void): void` that accepts a thrown value and a retry callback.
2. WHEN `toastApiErrorWithRetry` is called with an `ApiError` whose `status` is 429 or 500 or greater, THE Toast_Utility SHALL display a toast that includes a "Retry" button alongside the error message.
3. WHEN the "Retry" button within the toast is activated, THE Toast_Utility SHALL invoke the `onRetry` callback and dismiss the toast.
4. WHEN `toastApiErrorWithRetry` is called with an `ApiError` whose `status` is 401, 403, or 404, THE Toast_Utility SHALL display a standard error toast without a Retry_CTA, because retrying would not resolve these errors.
5. WHEN `toastApiErrorWithRetry` is called with a non-`ApiError` value, THE Toast_Utility SHALL display a toast with a "Retry" button and the message "An unexpected error occurred."

---

### Requirement 4: SWR Global Error Integration

**User Story:** As a developer, I want SWR data-fetching errors to automatically show standardized toasts, so that I do not need to add per-hook `onError` handlers throughout the codebase.

#### Acceptance Criteria

1. THE Providers SHALL configure a SWR global `SWRConfig` with an `onError` handler.
2. WHEN SWR calls the global `onError` handler with an error, THE Providers SHALL invoke `toastApiError` with that error.
3. THE Providers SHALL NOT suppress or swallow the error after passing it to `toastApiError`, preserving SWR's default error state behavior for components that inspect `error` from `useSWR`.

---

### Requirement 5: Consistent Toast Usage at Call Sites

**User Story:** As a developer, I want all existing direct `toast.error` calls that handle `ApiError` to use the Toast_Utility, so that error messages are uniform across the application.

#### Acceptance Criteria

1. THE Toast_Utility SHALL be the sole mechanism for displaying API error toasts across the application.
2. WHEN a component catches an `ApiError` in a mutation or form submission handler, THE component SHALL call `toastApiError` or `toastApiErrorWithRetry` instead of calling `toast.error` directly with a hardcoded string.
3. THE application SHALL retain direct `toast.success` calls at call sites, as success messages are context-specific and do not require centralization.

---

### Requirement 6: Toast Utility Correctness

**User Story:** As a developer, I want the Toast_Utility mapping logic to be verifiable, so that I can be confident the correct message is shown for each HTTP status code.

#### Acceptance Criteria

1. FOR ALL defined `ApiError` status codes (401, 403, 404, 429, 500+), calling `toastApiError` with that status SHALL produce the corresponding mapped message and no other message.
2. FOR ALL `ApiError` instances with unmapped status codes, calling `toastApiError` SHALL produce a toast whose text equals the `ApiError`'s `message` property.
3. WHEN `toastApiError` is called with the same error value multiple times in sequence, THE Toast_Utility SHALL display a toast for each invocation (idempotence does not apply — each call is an independent notification event).
