jest.mock("../../config/prisma", () => ({
  prisma: {
    merchantSubscription: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from "../../config/prisma";
import {
  resolvePlanFeePercent,
  resolveMerchantSettlementFeePercent,
} from "../transactionFee.service";

describe("transaction fee policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SETTLEMENT_FEE_PERCENT;
  });

  it("prefers the active plan fee tier when present", () => {
    expect(resolvePlanFeePercent({ transaction_fee_percent: "0.85" })).toBe(0.85);
    expect(resolvePlanFeePercent({ tier: { fee_percent: 1.25 } })).toBe(1.25);
    expect(resolvePlanFeePercent({ transaction_fee_bps: 150 })).toBe(1.5);
  });

  it("falls back to the merchant fee when no plan override exists", async () => {
    (prisma.merchantSubscription.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      resolveMerchantSettlementFeePercent("merchant_123", {
        settlement_fee_percent: "2.25",
      } as any),
    ).resolves.toBe(2.25);
  });

  it("uses the default fee when there is no plan or merchant override", async () => {
    (prisma.merchantSubscription.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveMerchantSettlementFeePercent("merchant_456", {} as any)).resolves.toBe(2);
  });
});
