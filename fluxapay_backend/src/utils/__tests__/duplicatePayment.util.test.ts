import { Decimal } from "@prisma/client/runtime/library";
import { analyzeDuplicatePayments } from "../duplicatePayment.util";

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
});
