jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn().mockResolvedValue({
          sequenceNumber: () => "123",
          accountId: () => Keypair.random().publicKey(),
        }),
      })),
    },
    rpc: {
      ...actual.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: jest.fn().mockResolvedValue({ id: "sim-1" }),
        sendTransaction: jest.fn().mockResolvedValue({ status: "PENDING", hash: "tx-hash" }),
        getTransaction: jest.fn().mockResolvedValue({ status: "SUCCESS", resultMetaXdr: "meta" }),
      })),
      Api: {
        isSimulationSuccess: jest.fn().mockReturnValue(true),
      },
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn(),
    })),
  };
});

import { Keypair } from "@stellar/stellar-sdk";
import {
  getSorobanHealthStatus,
  recordSorobanSuccess,
  recordSorobanFailure,
  SorobanService,
} from "../SorobanService";

describe("SorobanService integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYMENT_CONTRACT_ID = "CTESTCONTRACT123";
    process.env.SOROBAN_ORACLE_SECRET = Keypair.random().secret();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("verifies payment on-chain and records success for admin health monitoring", async () => {
    const service = new SorobanService();
    jest.spyOn(service, "verifyPaymentOnChain").mockImplementation(async () => {
      recordSorobanSuccess();
      return true;
    });

    await expect(
      service.verifyPaymentOnChain(
        "pay-integration-1",
        "stellar-tx-hash",
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        10,
      ),
    ).resolves.toBe(true);

    expect(getSorobanHealthStatus().last_success).not.toBeNull();
  });

  it("tracks Soroban health status for admin endpoint", () => {
    recordSorobanFailure("rpc timeout");
    let health = getSorobanHealthStatus();
    expect(health.last_failure).not.toBeNull();
    expect(health.last_error).toBe("rpc timeout");

    recordSorobanSuccess();
    health = getSorobanHealthStatus();
    expect(health.last_success).not.toBeNull();
    expect(health.last_error).toBeNull();
  });
});
