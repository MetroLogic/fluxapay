import { getLogger } from "../utils/logger";

const logger = getLogger("AlertingService");

export interface AlertParams {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  details?: Record<string, any>;
}

/**
 * Send an alert to operations team
 * Supports email and Slack notifications
 */
export async function sendAlert(params: AlertParams): Promise<void> {
  const { type, severity, message, details } = params;

  logger.info("Alert generated", {
    type,
    severity,
    message: message.substring(0, 200),
    details,
  });

  // Email alerts
  if (shouldEmailAlert(severity)) {
    await sendEmailAlert(params);
  }

  // Slack alerts
  if (shouldSlackAlert(severity)) {
    await sendSlackAlert(params);
  }
}

function shouldEmailAlert(severity: string): boolean {
  return severity === "critical" || severity === "warning";
}

function shouldSlackAlert(severity: string): boolean {
  return severity === "critical" || severity === "warning";
}

/**
 * Send alert via email
 */
async function sendEmailAlert(params: AlertParams): Promise<void> {
  try {
    const opEmail = process.env.OPS_EMAIL || "ops@fluxapay.com";

    // Would integrate with your email service here
    // For now, just log the alert
    logger.info("Email alert would be sent", {
      to: opEmail,
      type: params.type,
      severity: params.severity,
    });
  } catch (error) {
    logger.error("Failed to send email alert", {
      error: (error as Error).message,
    });
  }
}

/**
 * Send alert via Slack
 */
async function sendSlackAlert(params: AlertParams): Promise<void> {
  try {
    const slackWebhook = process.env.SLACK_ALERTS_WEBHOOK;
    if (!slackWebhook) {
      logger.debug("Slack webhook not configured, skipping Slack alert");
      return;
    }

    const color = params.severity === "critical" ? "danger" : "warning";
    const payload = {
      attachments: [
        {
          color,
          title: `${params.severity.toUpperCase()}: ${params.type}`,
          text: params.message,
          fields: Object.entries(params.details || {}).map(([key, value]) => ({
            title: key,
            value: JSON.stringify(value),
            short: true,
          })),
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const response = await fetch(slackWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn("Slack alert delivery failed", {
        status: response.status,
        type: params.type,
      });
    }
  } catch (error) {
    logger.error("Failed to send Slack alert", {
      error: (error as Error).message,
    });
  }
}
