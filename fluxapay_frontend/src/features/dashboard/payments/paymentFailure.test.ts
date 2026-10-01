import { PAYMENT_FAILURE_FALLBACK, describePaymentFailure } from "./paymentFailure";
import type { Payment } from "./types";

const failedEntry = (note?: string) => ({
  status: "failed" as const,
  timestamp: "2026-01-01T00:00:00.000Z",
  note,
});

describe("describePaymentFailure", () => {
  it("surfaces the most recent recorded failure reason", () => {
    const message = describePaymentFailure({
      statusHistory: [
        failedEntry("First attempt rejected"),
        { status: "pending", timestamp: "2026-01-02T00:00:00.000Z" },
        failedEntry("Insufficient balance to cover amount and network fee"),
      ],
    } as Pick<Payment, "statusHistory">);

    expect(message).toBe("Insufficient balance to cover amount and network fee");
  });

  it("ignores blank failure notes", () => {
    const message = describePaymentFailure({
      statusHistory: [failedEntry("   ")],
    } as Pick<Payment, "statusHistory">);

    expect(message).toBe(PAYMENT_FAILURE_FALLBACK);
  });

  it("falls back to actionable guidance when no reason was recorded", () => {
    expect(describePaymentFailure({ statusHistory: [] })).toBe(PAYMENT_FAILURE_FALLBACK);
    expect(describePaymentFailure({})).toBe(PAYMENT_FAILURE_FALLBACK);
  });

  it("uses the latest failed entry even after a later non-failed entry", () => {
    const message = describePaymentFailure({
      statusHistory: [
        failedEntry("Sequence number mismatch"),
        { status: "pending", timestamp: "2026-01-03T00:00:00.000Z" },
      ],
    } as Pick<Payment, "statusHistory">);

    expect(message).toBe("Sequence number mismatch");
  });
});
