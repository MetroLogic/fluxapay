/**
 * settlementAlert.service.ts
 *
 * Sends real-time alerts to the platform team when a settlement fails
 * (e.g. bank account rejected, Stellar network errors, exchange partner errors).
 *
 * Supports Slack incoming webhooks and/or a Telegram bot. Both channels are
 * optional and configured via env vars:
 *  - SETTLEMENT_ALERT_WEBHOOK_URL: Slack (or Slack-compatible) incoming webhook URL
 *  - TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID: Telegram bot credentials
 *
 * If no channel is configured, alerts are simply logged to the console.
 */

export interface SettlementFailureAlert {
  merchantId: string;
  settlementId?: string;
  paymentId?: string;
  amount?: number | string;
  currency?: string;
  error: string;
  retryCount?: number;
}

function buildAlertMessage(alert: SettlementFailureAlert): string {
  const lines = [
    "🚨 Settlement Failure Alert",
    `Merchant ID: ${alert.merchantId || "unknown"}`,
  ];

  if (alert.settlementId) lines.push(`Settlement ID: ${alert.settlementId}`);
  if (alert.paymentId) lines.push(`Payment ID: ${alert.paymentId}`);
  if (alert.amount !== undefined) lines.push(`Amount: ${alert.amount} ${alert.currency || ""}`.trim());
  if (alert.retryCount !== undefined) lines.push(`Retry Count: ${alert.retryCount}`);
  lines.push(`Error: ${alert.error}`);

  return lines.join("\n");
}

async function sendSlackAlert(message: string): Promise<void> {
  const webhookUrl = process.env.SETTLEMENT_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!response.ok) {
      console.error(`[SettlementAlert] Slack webhook responded with HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("[SettlementAlert] Failed to send Slack alert:", error);
  }
}

async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });

    if (!response.ok) {
      console.error(`[SettlementAlert] Telegram API responded with HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("[SettlementAlert] Failed to send Telegram alert:", error);
  }
}

/**
 * Send a settlement failure alert to all configured channels (Slack and/or Telegram).
 * Never throws — failures to deliver an alert must not interrupt settlement processing.
 */
export async function sendSettlementFailureAlert(alert: SettlementFailureAlert): Promise<void> {
  const message = buildAlertMessage(alert);
  console.error(`[SettlementAlert] ${message.replace(/\n/g, " | ")}`);

  await Promise.all([sendSlackAlert(message), sendTelegramAlert(message)]);
}

/**
 * Generic ops alert for non-settlement events (e.g. the FX circuit breaker
 * opening) that should reach the same Slack/Telegram channels. Shares the
 * same env-configured channels as sendSettlementFailureAlert. Never throws.
 */
export async function sendOpsAlert(prefix: string, message: string): Promise<void> {
  console.error(`[${prefix}] ${message.replace(/\n/g, " | ")}`);

  const prefixedMessage = `[${prefix}] ${message}`;
  await Promise.all([sendSlackAlert(prefixedMessage), sendTelegramAlert(prefixedMessage)]);
}

/**
 * Sends an alert when the deposit address pool reaches high utilization (e.g. >= 80%).
 * Never throws.
 */
export async function sendDepositPoolAlert(stats: {
  utilizationPct: number;
  availableCount: number;
  totalCount: number;
  allocatedCount?: number;
}): Promise<void> {
  const pctStr = (stats.utilizationPct * 100).toFixed(1);
  const message = `🚨 Deposit Address Pool Alert: High utilization at ${pctStr}% (${stats.availableCount}/${stats.totalCount} available)`;
  await sendOpsAlert("DepositAddressPool", message);
}

