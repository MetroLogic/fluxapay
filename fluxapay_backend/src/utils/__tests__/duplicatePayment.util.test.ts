import { Decimal } from "@prisma/client/runtime/library";
import {
  analyzeDuplicatePayments,
  calculatePaymentReceiptProgress,
} from "../duplicatePayment.util";

describe("analyzeDuplicatePayments", () => {
  it("returns ok for a single matching transaction", () => {
    const expected = new Decimal(100);
    const result = analyzeDuplicatePayments(expected, [
      { transactionHash: "tx-1", amount: new Decimal(100) },
    ]);

    expect(result.hasDuplicate).toBe(false);
    expect(result.transactionHashes).toEqual(["tx-1"]);
    expect(result.totalReceived.toString()).toBe("100");
    expect(result.surplusAmount.toString()).toBe("0");
  });

  it("flags duplicate when multiple transactions match the same charge", () => {
    const expected = new Decimal(100);
    const result = analyzeDuplicatePayments(expected, [
      { transactionHash: "tx-1", amount: new Decimal(100) },
      { transactionHash: "tx-2", amount: new Decimal(50) },
    ]);

    expect(result.hasDuplicate).toBe(true);
    expect(result.transactionHashes).toEqual(["tx-1", "tx-2"]);
    expect(result.totalReceived.toString()).toBe("150");
    expect(result.surplusAmount.toString()).toBe("50");
  });

  it("settles multiple partial deposits against the cumulative expected amount", () => {
    const expected = new Decimal(100);
    const receipts = [
      { transactionHash: "tx-1", amount: new Decimal("35.25") },
      { transactionHash: "tx-2", amount: new Decimal("24.75") },
    ];
    const { totalReceived } = analyzeDuplicatePayments(expected, receipts);
    const progress = calculatePaymentReceiptProgress(expected, totalReceived);

    expect(totalReceived.toString()).toBe("60");
    expect(progress.amountReceived.toString()).toBe("60");
    expect(progress.remainingBalance.toString()).toBe("40");
    expect(progress.status).toBe("partially_paid");
    expect(progress.verified).toBe(false);
  });

  it("does not classify exact multi-deposit settlement as a duplicate", () => {
    const result = analyzeDuplicatePayments(new Decimal(100), [
      { transactionHash: "tx-1", amount: new Decimal(40) },
      { transactionHash: "tx-2", amount: new Decimal(60) },
    ]);

    expect(result.hasDuplicate).toBe(false);
    expect(result.surplusAmount.toString()).toBe("0");
  });

  it("confirms a payment when the final deposit covers the remaining balance", () => {
    const expected = new Decimal(100);
    const receipts = [
      { transactionHash: "tx-1", amount: new Decimal(40) },
      { transactionHash: "tx-2", amount: new Decimal(60) },
    ];
    const { totalReceived } = analyzeDuplicatePayments(expected, receipts);
    const progress = calculatePaymentReceiptProgress(expected, totalReceived);

    expect(progress.amountReceived.toString()).toBe("100");
    expect(progress.remainingBalance.toString()).toBe("0");
    expect(progress.status).toBe("confirmed");
    expect(progress.verified).toBe(true);
  });
});
