import { sendDiscrepancyAlert, buildDiscrepancyPayload } from "../discrepancyAlert.service";

const summary = {
  reportDate: new Date("2026-01-02T00:00:00Z"),
  discrepancies: [
    { type: "amountMismatch" as const, paymentId: "p1", txHash: "abc", expected: 10, actual: 9 },
  ],
};

describe("sendDiscrepancyAlert", () => {
  const env = { ...process.env };
  beforeEach(() => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("dispatches to the webhook when discrepancies exist", async () => {
    process.env.DISCREPANCY_ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/x";
    expect(await sendDiscrepancyAlert(summary)).toBe(true);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it("stays silent on a clean reconciliation", async () => {
    process.env.DISCREPANCY_ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/x";
    expect(await sendDiscrepancyAlert({ ...summary, discrepancies: [] })).toBe(false);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it("stays silent when no webhook is configured", async () => {
    delete process.env.DISCREPANCY_ALERT_WEBHOOK_URL;
    expect(await sendDiscrepancyAlert(summary)).toBe(false);
  });

  it("uses embeds for Discord and blocks for Slack", () => {
    expect(
      buildDiscrepancyPayload(summary, "https://discord.com/api/webhooks/1/x"),
    ).toHaveProperty("embeds");
    expect(buildDiscrepancyPayload(summary, "https://hooks.slack.com/x")).toHaveProperty("blocks");
  });
});
