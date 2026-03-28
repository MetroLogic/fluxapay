import type { SmsProvider } from "./smsProvider.interface";

export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async sendSms(toE164: string, body: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: toE164,
        From: this.fromNumber,
        Body: body,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Twilio SMS failed (${res.status}): ${text.slice(0, 200)}`,
      );
    }
  }
}
