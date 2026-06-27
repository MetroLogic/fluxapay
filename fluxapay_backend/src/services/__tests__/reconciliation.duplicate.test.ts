import { Decimal } from "@prisma/client/runtime/library";
import { analyzeDuplicatePayments } from "../../utils/duplicatePayment.util";

describe("reconciliation duplicate payment detection", () => {
  it("single payment receipt is not flagged as duplicate", () => {
    const analysis = analyzeDuplicatePayments(new Decimal(100), [
      { transactionHash: "abc123", amount: new Decimal(100) },
    ]);

    expect(analysis.hasDuplicate).toBe(false);
    expect(analysis.surplusAmount.toString()).toBe("0");
  });

  it("multiple receipts for same charge are flagged with surplus", () => {
    const analysis = analyzeDuplicatePayments(new Decimal(100), [
      { transactionHash: "abc123", amount: new Decimal(100) },
      { transactionHash: "def456", amount: new Decimal(25) },
    ]);

    expect(analysis.hasDuplicate).toBe(true);
    expect(analysis.transactionHashes).toEqual(["abc123", "def456"]);
    expect(analysis.totalReceived.toString()).toBe("125");
    expect(analysis.surplusAmount.toString()).toBe("25");
  });
});
