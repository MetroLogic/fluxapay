/**
 * Discrepancy alerting: posts a structured incident summary to a Slack or
 * Discord incoming webhook when daily reconciliation finds discrepancies.
 *
 * Env:
 *   DISCREPANCY_ALERT_WEBHOOK_URL  Slack or Discord incoming webhook URL
 *   ADMIN_DASHBOARD_URL            base URL of the admin dashboard (for the deep link)
 */
export interface DiscrepancyItem {
  type: "unmatchedOnChain" | "amountMismatch" | "unrecordedInternal";
  paymentId?: string;
  txHash?: string | null;
  expected?: number | string | null;
  actual?: number | string | null;
}

export interface DiscrepancySummary {
  reportDate: Date;
  merchantId?: string;
  discrepancies: DiscrepancyItem[];
}

const MAX_LISTED = 10;

export function isDiscordWebhook(url: string): boolean {
  return /discord(app)?\.com\/api\/webhooks\//.test(url);
}

export function getReconciliationDashboardLink(): string {
  const base = (process.env.ADMIN_DASHBOARD_URL || "").replace(/\/$/, "");
  return `${base}/admin/reconciliation`;
}

function line(d: DiscrepancyItem): string {
  const parts = [`*${d.type}*`];
  if (d.paymentId) parts.push(`payment ${d.paymentId}`);
  if (d.txHash) parts.push(`tx \`${d.txHash}\``);
  if (d.expected !== undefined || d.actual !== undefined) {
    parts.push(`expected ${d.expected ?? "n/a"} / actual ${d.actual ?? "n/a"}`);
  }
  return parts.join(" - ");
}

export function buildDiscrepancyPayload(summary: DiscrepancySummary, webhookUrl: string) {
  const date = summary.reportDate.toISOString().slice(0, 10);
  const link = getReconciliationDashboardLink();
  const shown = summary.discrepancies.slice(0, MAX_LISTED);
  const more = summary.discrepancies.length - shown.length;
  const title = `Reconciliation discrepancies detected (${date})`;
  const body = shown.map(line).join("\n") + (more > 0 ? `\n...and ${more} more` : "");

  if (isDiscordWebhook(webhookUrl)) {
    return {
      embeds: [
        {
          title,
          url: link,
          color: 0xe01e5a,
          description: body,
          fields: [
            { name: "Discrepancies", value: String(summary.discrepancies.length), inline: true },
            ...(summary.merchantId
              ? [{ name: "Merchant", value: summary.merchantId, inline: true }]
              : []),
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  return {
    text: title,
    blocks: [
      { type: "header", text: { type: "plain_text", text: title } },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${summary.discrepancies.length}* discrepancies\n${body}` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open reconciliation dashboard" },
            url: link,
          },
        ],
      },
    ],
  };
}

/**
 * Sends the alert. Returns true if dispatched; silent (false) when there are no
 * discrepancies or no webhook is configured. Never throws.
 */
export async function sendDiscrepancyAlert(summary: DiscrepancySummary): Promise<boolean> {
  const url = process.env.DISCREPANCY_ALERT_WEBHOOK_URL;
  if (!url || summary.discrepancies.length === 0) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscrepancyPayload(summary, url)),
    });
    if (!res.ok) {
      console.error(`Discrepancy alert webhook responded ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send discrepancy alert", err);
    return false;
  }
}
