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
   * Includes an automatic retry mechanism for robustness.
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

    const MAX_RETRIES = 3;
    let attempt = 0;
    const baseDelay = 1000;

    while (attempt < MAX_RETRIES) {
      try {
        await this.invokeRegisterContract(
          merchantId,
          businessName,
          settlementCurrency,
        );
        if (isDevEnv()) {
          console.log(
            `Successfully registered merchant ${merchantId} on-chain.`,
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

  private async invokeRegisterContract(
    merchantId: string,
    businessName: string,
    settlementCurrency: string,
  ) {
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

    const builder = new TransactionBuilder(sourceAccount, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    });

    const tx = builder
      .addOperation(contract.call("register_merchant", ...args))
      .setTimeout(30)
      .build();

    const preparedTx = (await this.server.prepareTransaction(tx)) as any;

    preparedTx.sign(this.adminKeypair);

    const sendTxResponse = await this.server.sendTransaction(preparedTx);

    if (sendTxResponse.status === "ERROR") {
      throw new Error(
        `Transaction submission failed: ${JSON.stringify(sendTxResponse)}`,
      );
    }

    // Wait for the transaction to be processed
    let txResponse = await this.server.getTransaction(sendTxResponse.hash);

    let retries = 0;
    while (txResponse.status === "NOT_FOUND" && retries < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      txResponse = await this.server.getTransaction(sendTxResponse.hash);
      retries++;
    }

    return true;
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
