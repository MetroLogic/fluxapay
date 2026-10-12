import type { EmailProvider, EmailOptions } from "./emailProvider.interface";

export class MockEmailProvider implements EmailProvider {
  async sendEmail(_options: EmailOptions): Promise<void> {
    return;
  }
}
