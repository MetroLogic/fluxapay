import {
  Keypair,
  nativeToScVal,
  rpc,
  TransactionBuilder,
  Networks,
  Contract,
} from "@stellar/stellar-sdk";
import { isDevEnv } from "../helpers/env.helper";
import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

export class MerchantRegistryService {
  private rpcUrl: string;
  private networkPassphrase: string;
  private contractId: string;
  private adminKeypair: Keypair;
  private server: rpc.Server;

  constructor() {
    this.rpcUrl =
      process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
    this.networkPassphrase =
      process.env.SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
    this.contractId = process.env.MERCHANT_REGISTRY_CONTRACT_ID || "";

    const adminSecret = process.env.ADMIN_SECRET_KEY;
    if (adminSecret) {
      this.adminKeypair = Keypair.fromSecret(adminSecret);
    } else {
      // Create a random one for dev/fallback if missing, though it won't actually have authorization on mainnet
      this.adminKeypair = Keypair.random();
      if (isDevEnv()) {
        console.warn(
          "ADMIN_SECRET_KEY not set. Using random keypair. Contract calls will likely fail.",
        );
      }
    }

    this.server = new rpc.Server(this.rpcUrl);
  }

  /**
   * Registers a merchant on-chain via the Soroban Smart Contract.
   * Idempotent: checks DB state before each attempt so retries never submit
   * a second registration transaction for the same merchant.
   * Throws an error if we exceed max retries.
   */
  public async register_merchant(
    merchantId: string,
    businessName: string,
    settlementCurrency: string,
  ): Promise<boolean> {
    if (!this.contractId) {
      console.warn(
        "MERCHANT_REGISTRY_CONTRACT_ID is not configured. Skipping on-chain registration.",
      );
      return false;
    }

    // Idempotency guard: if a previous call already completed on-chain, skip.
    const existing = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { onchain_registered: true, onchain_registry_tx_hash: true },
    });
    if (existing?.onchain_registered) {
      if (isDevEnv()) {
        console.log(
          `Merchant ${merchantId} already registered on-chain (tx: ${existing.onchain_registry_tx_hash}). Skipping.`,
        );
      }
      return true;
    }

    const MAX_RETRIES = 3;
    let attempt = 0;
    const baseDelay = 1000;

    while (attempt < MAX_RETRIES) {
      // Re-check DB at each retry boundary to handle concurrent callers.
      if (attempt > 0) {
        const recheck = await prisma.merchant.findUnique({
          where: { id: merchantId },
          select: { onchain_registered: true },
        });
        if (recheck?.onchain_registered) {
          if (isDevEnv()) {
            console.log(
              `Merchant ${merchantId} registered on-chain by a concurrent process. Skipping retry.`,
            );
          }
          return true;
        }
      }

      try {
        const txHash = await this.invokeRegisterContract(
          merchantId,
          businessName,
          settlementCurrency,
        );

        // Mark as registered in DB so future calls (or retries) are no-ops.
        await prisma.merchant.update({
          where: { id: merchantId },
          data: {
            onchain_registered: true,
            onchain_registry_tx_hash: txHash,
          },
        });

        if (isDevEnv()) {
          console.log(
            `Successfully registered merchant ${merchantId} on-chain (tx: ${txHash}).`,
          );
        }
        return true;
      } catch (error) {
        attempt++;
        let errorMessage = "Unknown error";
        if (error instanceof Error) errorMessage = error.message;

        console.error(
          `Attempt ${attempt} to register merchant ${merchantId} on-chain failed:`,
          errorMessage,
        );

        if (attempt >= MAX_RETRIES) {
          await this.logToManualInterventionQueue(merchantId, errorMessage);
          throw new Error(
            `Max retries reached for on-chain registration: ${errorMessage}`,
          );
        }

        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)),
        );
      }
    }
    return false;
  }

  /**
   * Submits the register_merchant call to Soroban and waits for confirmation.
   * Returns the confirmed transaction hash.
   */
  private async invokeRegisterContract(
    merchantId: string,
    businessName: string,
    settlementCurrency: string,
  ): Promise<string> {
    const contract = new Contract(this.contractId);

    // Prepare arguments: merchant_id, business_name, settlement_currency
    const args = [
      nativeToScVal(merchantId, { type: "string" }),
      nativeToScVal(businessName, { type: "string" }),
      nativeToScVal(settlementCurrency, { type: "symbol" }),
    ];

    const sourceAccount = await this.server.getAccount(
      this.adminKeypair.publicKey(),
    );

    // Use a minimal placeholder fee; real fee is determined by XDR simulation below.
    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call("register_merchant", ...args))
      .setTimeout(30)
      .build();

    // Estimate Soroban resource fees from XDR simulation result.
    const simulation = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new Error(
        `Soroban XDR fee simulation failed: ${simulation.error}`,
      );
    }

    // assembleTransaction sets the resource fee, footprint, and auth from simulation XDR.
    const preparedTx = rpc.assembleTransaction(tx, simulation).build();
    preparedTx.sign(this.adminKeypair);

    const sendTxResponse = await this.server.sendTransaction(preparedTx);

    if (sendTxResponse.status === "ERROR") {
      throw new Error(
        `Transaction submission failed: ${JSON.stringify(sendTxResponse)}`,
      );
    }

    // Poll until the transaction is confirmed or times out.
    let txResponse = await this.server.getTransaction(sendTxResponse.hash);
    let retries = 0;
    while (txResponse.status === "NOT_FOUND" && retries < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      txResponse = await this.server.getTransaction(sendTxResponse.hash);
      retries++;
    }

    if (txResponse.status === "FAILED") {
      throw new Error(
        `Transaction failed on-chain: ${JSON.stringify(txResponse)}`,
      );
    }

    return sendTxResponse.hash;
  }

  private async logToManualInterventionQueue(
    merchantId: string,
    reason: string,
  ) {
    console.error(
      `[MANUAL INTERVENTION REQUIRED] Merchant ${merchantId} failed on-chain registration: ${reason}`,
    );
    try {
      await prisma.manualIntervention.create({
        data: {
          merchantId,
          issue_type: "onchain_registration_failed",
          description: `On-chain registration failed after max retries. Reason: ${reason}`,
        },
      });
    } catch (dbError) {
      console.error(
        `Failed to create manual intervention record for merchant ${merchantId}:`,
        dbError,
      );
    }
  }
}

export const merchantRegistryService = new MerchantRegistryService();
