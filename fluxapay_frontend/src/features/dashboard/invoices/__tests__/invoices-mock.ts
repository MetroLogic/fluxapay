/**
 * ⚠️ DEPRECATED: This file re-exports mock data from __mocks__ for backward compatibility.
 * For new code and tests, import directly from ./__mocks__/invoices-mock.ts
 * Do NOT use mock data in production components. Use api.invoices.list() instead.
 */
/* eslint-disable @typescript-eslint/no-restricted-imports */
export type { InvoiceStatus, LineItem, Invoice } from "./types";
export { MOCK_INVOICES } from "./__mocks__/invoices-mock";
