/**
 * ⚠️ DEPRECATED: This file re-exports mock data from __mocks__ for backward compatibility.
 * For new code and tests, import directly from ./__mocks__/payments-mock.ts
 * Do NOT use mock data in production components. Use api.payments.list() instead.
 */
/* eslint-disable @typescript-eslint/no-restricted-imports */
export type { PaymentStatus, Payment } from "./__mocks__/payments-mock";
export { MOCK_PAYMENTS } from "./__mocks__/payments-mock";
