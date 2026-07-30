import dotenv from "dotenv";
import type { EmailProvider, EmailOptions } from "./emailProvider.interface";
dotenv.config();

export class SendGridEmailProvider implements EmailProvider {
  async sendEmail(options: EmailOptions): Promise<void> {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("SENDGRID_API_KEY is not configured");
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: options.from },
        subject: options.subject,
        content: [{ type: "text/html", value: options.html }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`SendGrid API error (${response.status}): ${body}`);
    }
  }
}
