# Frontend: Accessibility Audit + SSE Real-time Payment Status

## Summary

This PR addresses two frontend issues:

1. **Accessibility (a11y) audit** -- Adds ARIA labels, roles, keyboard navigation, focus management, and WCAG-compliant touch targets across checkout and dashboard components.
2. **Checkout: Real-time payment status via SSE** -- Replaces polling with Server-Sent Events (EventSource) for instant payment confirmation, with automatic fallback to the existing 3-second polling if SSE is unavailable.

## Changes

### Accessibility Improvements

**Checkout components:**
- `PaymentStatus.tsx` -- Added `role="status"`, `aria-live="polite"`, `aria-label`, and `aria-hidden` on decorative icons.
- `PaymentTimer.tsx` -- Added `role="timer"`, `aria-live="off"`, human-readable `aria-label`, and `min-h-[44px]` touch target.
- `PaymentQRCode.tsx` -- Added `role="img"` with descriptive `aria-label` on QR container, `aria-labelledby` linking address to its label.
- `pay/[payment_id]/page.tsx` -- Added `role="status"` and `role="alert"` on state containers, `aria-hidden` on all decorative icons, `aria-label` on payment instructions, and responsive padding for mobile.

**Dashboard components:**
- `Sidebar.tsx` -- Added `aria-label` on sidebar and nav elements, `aria-current="page"` on active link, `aria-label="Close menu"` on mobile close button, `aria-hidden` on icons, and `min-h-[44px]` touch targets on all nav links.
- `DashboardShell.tsx` -- Added `role="main"` on main content area, `aria-hidden` on overlay backdrop, and Escape key handler to close mobile sidebar.
- `Modal.tsx` -- Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to modal title, focus trap (Tab key cycling), Escape key to close, focus restoration on close, and 44px minimum close button touch target.

### SSE Real-time Payment Status

- **New file: `api/payments/[payment_id]/stream/route.ts`** -- SSE endpoint using `ReadableStream` that pushes payment status every 2 seconds. Automatically closes the stream on terminal states (confirmed, expired, failed). Cleans up on client disconnect via `AbortSignal`.
- **Modified: `hooks/usePaymentStatus.ts`** -- Connects via `EventSource` first for instant updates. On SSE error or connection failure, automatically falls back to the existing 3-second polling. Exposes `connectionType` (`'sse' | 'polling'`) for observability. Properly cleans up both EventSource and polling intervals on unmount or terminal state.

## Testing

All CI pipeline checks pass:

| Check | Result |
|-------|--------|
| ESLint (`npx eslint . --max-warnings=0`) | Pass, 0 warnings |
| Build (`npm run build`) | Pass, exit 0. SSE stream route registered as dynamic route |
| Unit tests (`npm test`) | 15/15 tests pass across 4 test files |

No new dependencies were added. All existing tests (PaymentStatus, StatsCards, LoginForm, SignUpForm) continue to pass without modification.

## Files Changed (10 files, 1 new)

- `src/components/checkout/PaymentStatus.tsx`
- `src/components/checkout/PaymentTimer.tsx`
- `src/components/checkout/PaymentQRCode.tsx`
- `src/components/Modal.tsx`
- `src/app/pay/[payment_id]/page.tsx`
- `src/features/dashboard/components/Sidebar.tsx`
- `src/features/dashboard/layout/DashboardShell.tsx`
- `src/hooks/usePaymentStatus.ts`
- `src/app/api/payments/[payment_id]/stream/route.ts` [NEW]
