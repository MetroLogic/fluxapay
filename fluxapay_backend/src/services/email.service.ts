import dotenv from "dotenv";
import { Resend } from "resend";
import { isDevEnv } from "../helpers/env.helper";
dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = new Resend(RESEND_API_KEY);

export async function sendWelcomeEmail(
  to: string,
  businessName: string,
  apiKey: string,
  dashboardUrl: string,
) {
  try {
    const response = await resend.emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to,
      subject: "Welcome to FluxaPay!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to FluxaPay, ${businessName}!</h2>
          <p>Your merchant account is now active. Here are your credentials to get started:</p>

          <h3>Your API Key</h3>
          <p style="background: #f4f4f4; padding: 12px; border-radius: 4px; font-family: monospace; word-break: break-all;">
            ${apiKey}
          </p>
          <p><strong>Important:</strong> Store this key securely. It will not be shown again.</p>

          <h3>Get Started</h3>
          <ul>
            <li><a href="${dashboardUrl}">Go to your Dashboard</a></li>
            <li><a href="${dashboardUrl}/docs">Integration Documentation</a></li>
          </ul>

          <p>If you have any questions, reply to this email or visit our support page.</p>
          <p>— The FluxaPay Team</p>
        </div>
      `,
    });
    if (response.error) {
      if (isDevEnv()) {
        console.error("Error sending welcome email:", response.error);
      }
      throw new Error("Failed to send welcome email");
    }
  } catch (err) {
    if (isDevEnv()) {
      console.error("Error sending welcome email:", err);
    }
    throw err;
  }
}

export async function sendOtpEmail(to: string, otp: string) {
  try {
    const response = await resend.emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to,
      subject: "Your Fluxapay OTP",
      html: `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    });
    if (response.error) {
      if (isDevEnv()) {
        console.error("Error sending OTP:", response.error);
      }
      throw new Error("Failed to send OTP email");
    }
  } catch (err) {
    if (isDevEnv()) {
      console.error("Error sending OTP:", err);
    }
    throw err;
  }
}
