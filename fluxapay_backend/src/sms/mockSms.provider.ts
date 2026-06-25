import type { SmsProvider } from "./smsProvider.interface";

export type MockSmsEntry = { to: string; body: string; at: number };

const outbox: MockSmsEntry[] = [];

export function getMockSmsOutbox(): MockSmsEntry[] {
  return [...outbox];
}

export function resetMockSmsOutbox(): void {
  outbox.length = 0;
}

export class MockSmsProvider implements SmsProvider {
  async sendSms(toE164: string, body: string): Promise<void> {
    outbox.push({ to: toE164, body, at: Date.now() });
  }
}
