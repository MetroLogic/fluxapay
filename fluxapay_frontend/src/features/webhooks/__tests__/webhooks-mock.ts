/**
 * ⚠️ DEPRECATED: This file re-exports mock data from __mocks__ for backward compatibility.
 * For new code and tests, import directly from ./__mocks__/webhooks-mock.ts
 * Do NOT use mock data in production components. Use api.webhooks.logs() instead.
 */
/* eslint-disable @typescript-eslint/no-restricted-imports */
export type { WebhookStatus, WebhookEvent } from "./__mocks__/webhooks-mock";
export { mockWebhooks } from "./__mocks__/webhooks-mock";
