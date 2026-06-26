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

export interface PaymentConfirmationDetails {
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

export async function sendInvoiceEmail(
  to: string,
  invoiceNumber: string,
  amount: string,
  currency: string,
  dueDate: string | null,
  paymentLink: string,
  merchantName?: string,
) {
  try {
    const response = await getResend().emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to,
      subject: `Invoice #${invoiceNumber} from ${merchantName || "FluxaPay"}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invoice #${invoiceNumber}</h2>
          <p>Hello,</p>
          <p>You have received a new invoice from ${merchantName || "FluxaPay"}.</p>

          <div style="background: #f4f4f4; padding: 16px; border-radius: 4px; margin: 16px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0;"><strong>Amount:</strong></td>
                <td style="padding: 8px 0;">${amount} ${currency}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
                <td style="padding: 8px 0;">${dueDate ? new Date(dueDate).toLocaleDateString() : "On receipt"}</td>
              </tr>
            </table>
          </div>

          <p>
            <a href="${paymentLink}"
               style="display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
              Pay Invoice Now
            </a>
          </p>

          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            If you have any questions about this invoice, please contact the sender directly.
          </p>
          <p>— The FluxaPay Team</p>
        </div>
      `,
    });
    if (response.error) {
      if (isDevEnv()) {
        console.error("Error sending invoice email:", response.error);
      }
      throw new Error("Failed to send invoice email");
    }
  } catch (err) {
    if (isDevEnv()) {
      console.error("Error sending invoice email:", err);
    }
    throw err;
  }
}

export async function sendSecurityAlertEmail(data: {
  to: string;
  subject: string;
  message: string;
}) {
  try {
    const response = await getResend().emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to: data.to,
      subject: data.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">⚠️ Security Alert</h2>
          <p>Hello,</p>
          <p>${data.message}</p>
          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 4px; margin: 16px 0;">
            <p style="margin: 0; color: #991b1b;"><strong>Recommended Actions:</strong></p>
            <ul style="margin: 8px 0; color: #991b1b;">
              <li>Login to your account to verify your identity</li>
              <li>Review your recent login activity</li>
              <li>Change your password if you suspect unauthorized access</li>
              <li>Contact support if you did not initiate this action</li>
            </ul>
          </div>
          <p style="color: #666; font-size: 14px;">
            If you believe this is an error or need assistance, please contact our support team immediately.
          </p>
          <p>— The FluxaPay Security Team</p>
        </div>
      `,
    });
    if (response.error) {
      if (isDevEnv()) {
        console.error("Error sending security alert email:", response.error);
      }
      throw new Error("Failed to send security alert email");
    }
  } catch (err) {
    if (isDevEnv()) {
      console.error("Error sending security alert email:", err);
    }
    // Don't throw - security alerts shouldn't block the main flow
  }
}

export interface BackupFailureAlertDetails {
  to: string;
  backupId: string;
  reason: string;
}

export async function sendBackupFailureAlertEmail(
  details: BackupFailureAlertDetails,
): Promise<void> {
  try {
    const response = await getResend().emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to: details.to,
      subject: `🚨 [FluxaPay] Database Backup FAILED — ${details.backupId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">🚨 Database Backup Failed</h2>
          <p>The automated database backup job has failed. Immediate attention is required.</p>
          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 4px; margin: 16px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Backup ID:</td>
                <td style="padding: 6px 0; font-family: monospace; font-size: 12px;">${details.backupId}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Failure Reason:</td>
                <td style="padding: 6px 0; color: #991b1b;">${details.reason}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Time:</td>
                <td style="padding: 6px 0;">${new Date().toUTCString()}</td>
              </tr>
            </table>
          </div>
          <p><strong>Recommended Actions:</strong></p>
          <ol>
            <li>Check the application logs for the full error stack trace.</li>
            <li>Verify <code>DATABASE_URL</code> and <code>DB_BACKUP_ENCRYPTION_KEY</code> environment variables are set correctly.</li>
            <li>Confirm <code>pg_dump</code> is available and can connect to the database.</li>
            <li>Ensure the backup directory has sufficient disk space.</li>
            <li>Trigger a manual backup once the issue is resolved: check <code>cron.service.ts</code> for the manual trigger pattern.</li>
            <li>Consult the <a href="docs/DB_BACKUP_RUNBOOK.md">DB Backup Runbook</a> for detailed recovery steps.</li>
          </ol>
          <p style="color: #666; font-size: 13px;">
            This is an automated alert from the FluxaPay backup service. Do not reply to this email.
          </p>
          <p>— FluxaPay Ops</p>
        </div>
      `,
    });
    if (response.error) {
      if (isDevEnv()) {
        console.error("Error sending backup failure alert:", response.error);
      }
      throw new Error("Failed to send backup failure alert email");
    }
  } catch (err) {
    if (isDevEnv()) {
      console.error("Error sending backup failure alert:", err);
    }
    // Don't throw — alert failures must not mask the underlying backup error
  }
}
