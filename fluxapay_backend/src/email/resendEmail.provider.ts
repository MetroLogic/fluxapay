import dotenv from "dotenv";
import { Resend } from "resend";
import type { EmailProvider, EmailOptions } from "./emailProvider.interface";
dotenv.config();

let _resend: Resend | undefined;

function getClient(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export class ResendEmailProvider implements EmailProvider {
  async sendEmail(options: EmailOptions): Promise<void> {
    const response = await getClient().emails.send({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    if (response.error) {
      throw new Error(response.error.message || "Resend API error");
    }
  }
}
