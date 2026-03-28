import type { SmsProvider } from "./smsProvider.interface";

/**
 * MessageBird REST API (transactional SMS).
 * @see https://developers.messagebird.com/api/sms-messaging
 */
export class MessageBirdSmsProvider implements SmsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly originator: string,
  ) {}

  async sendSms(toE164: string, body: string): Promise<void> {
    const res = await fetch("https://rest.messagebird.com/messages", {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        originator: this.originator,
        recipients: [toE164],
        body,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `MessageBird SMS failed (${res.status}): ${text.slice(0, 200)}`,
      );
    }
  }
}
