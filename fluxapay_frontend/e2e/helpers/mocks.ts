import type { Page } from "@playwright/test";
import { isRealMode } from "./mode";

/**
 * In mocked mode, runs `register` to attach Playwright route handlers.
 * In real mode, no-op so traffic reaches the backend (or Next.js API routes).
 */
export async function setupMocks(
  page: Page,
  register: (page: Page) => void | Promise<void>,
): Promise<void> {
  if (isRealMode()) return;
  await register(page);
}
