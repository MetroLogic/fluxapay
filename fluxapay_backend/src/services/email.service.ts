import dotenv from "dotenv";
import { Resend } from "resend";
import { isDevEnv } from "../helpers/env.helper";
dotenv.config();

let _resend: Resend | undefined;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendWelcomeEmail(
  to: string,
  businessName: string,
  apiKey: string,
  dashboardUrl: string,
) {
  try {
    const response = await getResend().emails.send({
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
    const response = await getResend().emails.send({
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

export interface CheckoutExpiryReminderDetails {
  payment_id: string;
  amount: string;
  currency: string;
  customer_email: string;
  checkout_url: string;
  expires_at: string;
  minutes_remaining: number;
}

export async function sendCheckoutExpiryReminderEmail(
  to: string,
  businessName: string,
  details: CheckoutExpiryReminderDetails,
) {
  try {
    const response = await getResend().emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to,
      subject: `Checkout Expiring Soon — ${details.amount} ${details.currency} (${details.minutes_remaining} min left)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Checkout Expiring Soon</h2>
          <p>Hello ${businessName},</p>
          <p>A customer checkout is about to expire in <strong>${details.minutes_remaining} minutes</strong> without completing payment.</p>
          <div style="background: #fff8e1; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 16px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0;"><strong>Payment ID:</strong></td><td style="font-family: monospace; font-size: 12px;">${details.payment_id}</td></tr>
              <tr><td style="padding: 6px 0;"><strong>Amount:</strong></td><td>${details.amount} ${details.currency}</td></tr>
              <tr><td style="padding: 6px 0;"><strong>Customer:</strong></td><td>${details.customer_email}</td></tr>
              <tr><td style="padding: 6px 0;"><strong>Expires at:</strong></td><td>${new Date(details.expires_at).toLocaleString()}</td></tr>
            </table>
          </div>
          <p>
            <a href="${details.checkout_url}"
               style="display: inline-block; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
              View Checkout
            </a>
          </p>
          <p style="color: #666; font-size: 13px;">This is an automated alert. No action is required — this is for your awareness only.</p>
          <p>— The FluxaPay Team</p>
        </div>
      `,
    });
    if (response.error) {
      if (isDevEnv()) console.error("Error sending expiry reminder email:", response.error);
      throw new Error("Failed to send expiry reminder email");
    }
  } catch (err) {
    if (isDevEnv()) console.error("Error sending expiry reminder email:", err);
    throw err;
  }
}
  amount: string;
  currency: string;
  payment_id: string;
  merchant_reference?: string;
  explorer_link: string;
  timestamp: string;
}

export async function sendPaymentConfirmationEmail(
  to: string,
  businessName: string,
  details: PaymentConfirmationDetails,
) {
  try {
    const response = await getResend().emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to,
      subject: `Payment Confirmed - ${details.amount} ${details.currency}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payment Confirmed</h2>
          <p>Hello ${businessName},</p>
          <p>Your payment has been successfully confirmed on the Stellar network.</p>

          <div style="background: #f4f4f4; padding: 16px; border-radius: 4px; margin: 16px 0;">
            <h3 style="margin-top: 0;">Payment Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0;"><strong>Amount:</strong></td>
                <td style="padding: 8px 0;">${details.amount} ${details.currency}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Payment ID:</strong></td>
                <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${details.payment_id}</td>
              </tr>
              ${details.merchant_reference ? `
              <tr>
                <td style="padding: 8px 0;"><strong>Reference:</strong></td>
                <td style="padding: 8px 0;">${details.merchant_reference}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0;"><strong>Time:</strong></td>
                <td style="padding: 8px 0;">${new Date(details.timestamp).toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <p>
            <a href="${details.explorer_link}"
               style="display: inline-block; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
              View on Stellar Explorer
            </a>
          </p>

          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            This is an automated confirmation email. If you have any questions, please contact support.
          </p>
          <p>— The FluxaPay Team</p>
        </div>
      `,
    });
    if (response.error) {
      if (isDevEnv()) {
        console.error("Error sending payment confirmation email:", response.error);
      }
      throw new Error("Failed to send payment confirmation email");
    }
  } catch (err) {
    if (isDevEnv()) {
      console.error("Error sending payment confirmation email:", err);
    }
    throw err;
  }
}
