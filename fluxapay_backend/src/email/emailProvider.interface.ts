export type EmailDriver = "resend" | "sendgrid" | "mock" | "none";

export interface EmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  sendEmail(options: EmailOptions): Promise<void>;
}
