/**
 * ⚠️ DEPRECATED: This file re-exports mock data from __mocks__ for backward compatibility.
 * For new code and tests, import directly from ./__mocks__/refunds-mock.ts
 * Do NOT use mock data in production components. Use api.refunds.list() instead.
 */
/* eslint-disable @typescript-eslint/no-restricted-imports */
export type { RefundStatus, RefundReason, RefundRecord } from "./types";
export { MOCK_REFUNDS } from "./__mocks__/refunds-mock";
