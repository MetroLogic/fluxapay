import { Keypair } from "@stellar/stellar-sdk";
import { prisma } from "../../config/prisma";

const funderKeypair = Keypair.random();
const originalFunderSecret = process.env.FUNDER_SECRET_KEY;
process.env.FUNDER_SECRET_KEY = funderKeypair.secret();

const startupWarning = jest.spyOn(console, "warn").mockImplementation(() => {});
const { FunderMonitorService } = require("../funderMonitor.service") as typeof import("../funderMonitor.service");
startupWarning.mockRestore();

describe("FunderMonitorService", () => {
  let service: InstanceType<typeof FunderMonitorService>;
  let loadAccount: jest.Mock;
  const originalThreshold = process.env.FUNDER_LOW_BALANCE_THRESHOLD_XLM;

  beforeEach(() => {
    process.env.FUNDER_SECRET_KEY = funderKeypair.secret();
    process.env.FUNDER_LOW_BALANCE_THRESHOLD_XLM = "20";
    service = new FunderMonitorService();
    loadAccount = jest.fn();
    Object.defineProperty(service, "server", {
      value: { loadAccount },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalThreshold === undefined) {
      delete process.env.FUNDER_LOW_BALANCE_THRESHOLD_XLM;
    } else {
      process.env.FUNDER_LOW_BALANCE_THRESHOLD_XLM = originalThreshold;
    }
  });

  afterAll(() => {
    if (originalFunderSecret === undefined) {
      delete process.env.FUNDER_SECRET_KEY;
    } else {
      process.env.FUNDER_SECRET_KEY = originalFunderSecret;
    }
  });

  it("reports a healthy balance above the configured threshold", async () => {
    loadAccount.mockResolvedValue({
      balances: [{ asset_type: "native", balance: "25.5" }],
    });

    await expect(service.getBalanceStatus()).resolves.toEqual({
      publicKey: funderKeypair.publicKey(),
      xlmBalance: 25.5,
      thresholdXlm: 20,
      ok: true,
    });
    expect(loadAccount).toHaveBeenCalledWith(funderKeypair.publicKey());
  });

  it("reports an unhealthy balance below the configured threshold", async () => {
    loadAccount.mockResolvedValue({
      balances: [{ asset_type: "native", balance: "19.99" }],
    });

    await expect(service.getBalanceStatus()).resolves.toMatchObject({
      xlmBalance: 19.99,
      thresholdXlm: 20,
      ok: false,
    });
  });

  it("treats an account without a native balance as zero XLM", async () => {
    loadAccount.mockResolvedValue({
      balances: [{ asset_type: "credit_alphanum4", balance: "100" }],
    });

    await expect(service.getBalanceStatus()).resolves.toMatchObject({
      xlmBalance: 0,
      thresholdXlm: 20,
      ok: false,
    });
  });

  it("calculates pool utilization and reports healthy status below exhaustion", async () => {
    jest.spyOn(prisma.depositAddress, "groupBy").mockResolvedValue([
      { status: "available", _count: { status: 1 } },
      { status: "assigned", _count: { status: 3 } },
    ] as never);

    await expect(service.getPoolStatus()).resolves.toEqual({
      availableCount: 1,
      allocatedCount: 3,
      totalCount: 4,
      utilizationPct: 0.75,
      ok: true,
    });
  });

  it("marks pool utilization at the exhaustion threshold unhealthy", async () => {
    jest.spyOn(prisma.depositAddress, "groupBy").mockResolvedValue([
      { status: "available", _count: { status: 1 } },
      { status: "assigned", _count: { status: 4 } },
    ] as never);

    await expect(service.getPoolStatus()).resolves.toMatchObject({
      utilizationPct: 0.8,
      ok: false,
    });
  });

  it("propagates Horizon request failures", async () => {
    const error = new Error("Horizon request failed");
    loadAccount.mockRejectedValue(error);

    await expect(service.getBalanceStatus()).rejects.toBe(error);
  });

  it("propagates an error when the funder account does not exist", async () => {
    const error = new Error("Account not found");
    loadAccount.mockRejectedValue(error);

    await expect(service.getBalanceStatus()).rejects.toBe(error);
  });
});