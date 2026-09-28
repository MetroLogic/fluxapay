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
import { prisma } from "../config/prisma";
import { sendOpsAlert } from "./settlementAlert.service";


export interface MerchantRegistryJob {
  merchantId: string;
  txHash: string;
  attempts: number;
  maxAttempts: number;
}

const MAX_REGISTRY_ATTEMPTS = 30; // ~5 minutes with exponential backoff
const BASE_DELAY_MS = 1000;


export class MerchantRegistryService {
  private rpcUrl: string;
  private networkPassphrase: string;
  private contractId: string;
  private adminKeypair: Keypair;
  private server: rpc.Server;
  private registryQueue: MerchantRegistryJob[] = [];
  private queueRunning = false;

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
   * Sets merchant status to PENDING_CHAIN_REGISTRATION immediately.
   * The SorobanQueueService polls for confirmation asynchronously.
   * Throws an error if DB update fails.
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

    // Check current status
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { 
        status: true,
        onchain_registered: true, 
        onchain_registry_tx_hash: true 
      },
    });

    // If already registered on-chain, skip
    if (merchant?.onchain_registered) {
      if (isDevEnv()) {
        console.log(
          `Merchant ${merchantId} already registered on-chain (tx: ${merchant.onchain_registry_tx_hash}). Skipping.`,
        );
      }
      return true;
    }

    // If already pending registration, skip
    if (merchant?.status === "pending_chain_registration") {
      if (isDevEnv()) {
        console.log(
          `Merchant ${merchantId} already has pending chain registration. Skipping.`,
        );
      }
      return true;
    }

    try {
      // Submit the transaction
      const txHash = await this.invokeRegisterContract(
        merchantId,
        businessName,
        settlementCurrency,
      );

      // Set status to PENDING_CHAIN_REGISTRATION (not active yet)
      await prisma.merchant.update({
        where: { id: merchantId },
        data: {
          status: "pending_chain_registration",
          onchain_registry_tx_hash: txHash,
        },
      });

      if (isDevEnv()) {
        console.log(
          `Submitted on-chain registration for merchant ${merchantId} (tx: ${txHash}). Status: PENDING_CHAIN_REGISTRATION`,
        );
      }

      // Enqueue for polling confirmation
      this.enqueueForPolling(merchantId, txHash);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to submit on-chain registration for merchant ${merchantId}:`,
        errorMessage,
      );

      // Set status to CHAIN_REGISTRATION_FAILED
      await prisma.merchant.update({
        where: { id: merchantId },
        data: {
          status: "chain_registration_failed",
        },
      });

      // Log to manual intervention queue
      await this.logToManualInterventionQueue(merchantId, errorMessage);

      // Alert ops
      await sendOpsAlert(
        "MerchantRegistryFailure",
        `On-chain registration failed for merchant ${merchantId}: ${errorMessage}`,
      );

      throw error;
    }
  }

  /**
   * Enqueues a merchant registration for polling confirmation
   */
  private enqueueForPolling(merchantId: string, txHash: string): void {
    this.registryQueue.push({
      merchantId,
      txHash,
      attempts: 0,
      maxAttempts: MAX_REGISTRY_ATTEMPTS,
    });

    if (!this.queueRunning) {
      void this.drainQueue();
    }
  }

  /**
   * Poll for merchant registration confirmation
   */
  private async drainQueue(): Promise<void> {
    this.queueRunning = true;
    while (this.registryQueue.length > 0) {
      const job = this.registryQueue.shift()!;
      await this.pollForConfirmation(job);
    }
    this.queueRunning = false;
  }

  /**
   * Poll the transaction status until confirmed or max attempts exceeded
   */
  private async pollForConfirmation(job: MerchantRegistryJob): Promise<void> {
    job.attempts++;

    try {
      const txResponse = await this.server.getTransaction(job.txHash);

      if (txResponse.status === "SUCCESS") {
        // Transaction confirmed on-chain
        await prisma.merchant.update({
          where: { id: job.merchantId },
          data: {
            status: "active",
            onchain_registered: true,
          },
        });

        if (isDevEnv()) {
          console.log(
            `✓ Merchant ${job.merchantId} confirmed on-chain (tx: ${job.txHash})`,
          );
        }
        return;
      }

      if (txResponse.status === "FAILED") {
        // Transaction failed on-chain
        await prisma.merchant.update({
          where: { id: job.merchantId },
          data: {
            status: "chain_registration_failed",
          },
        });

        await this.logToManualInterventionQueue(
          job.merchantId,
          `On-chain transaction failed: ${JSON.stringify(txResponse)}`,
        );

        await sendOpsAlert(
          "MerchantRegistryFailure",
          `On-chain transaction failed for merchant ${job.merchantId}`,
        );

        console.error(
          `✗ Merchant ${job.merchantId} registration failed on-chain`,
        );
        return;
      }

      // Still NOT_FOUND - keep polling
      if (job.attempts < job.maxAttempts) {
        const delay = BASE_DELAY_MS * Math.pow(2, Math.min(job.attempts - 1, 5)); // Cap exponential growth
        console.log(
          `[MerchantRegistry] Polling ${job.merchantId} attempt ${job.attempts}/${job.maxAttempts} in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        this.registryQueue.unshift(job); // Re-queue for retry
      } else {
        // Max retries exceeded
        await prisma.merchant.update({
          where: { id: job.merchantId },
          data: {
            status: "chain_registration_failed",
          },
        });

        await this.logToManualInterventionQueue(
          job.merchantId,
          `Registration polling exceeded max attempts (${job.maxAttempts})`,
        );

        await sendOpsAlert(
          "MerchantRegistryTimeout",
          `Merchant ${job.merchantId} registration polling timed out after ${job.maxAttempts} attempts`,
        );

        console.error(
          `✗ Merchant ${job.merchantId} registration polling timed out after ${job.maxAttempts} attempts`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[MerchantRegistry] Polling ${job.merchantId} failed: ${msg}`,
      );

      if (job.attempts < job.maxAttempts) {
        const delay = BASE_DELAY_MS * Math.pow(2, Math.min(job.attempts - 1, 5));
        await new Promise((r) => setTimeout(r, delay));
        this.registryQueue.unshift(job);
      } else {
        await prisma.merchant.update({
          where: { id: job.merchantId },
          data: {
            status: "chain_registration_failed",
          },
        });

        await this.logToManualInterventionQueue(job.merchantId, msg);
        await sendOpsAlert(
          "MerchantRegistryError",
          `Merchant ${job.merchantId} registration polling error: ${msg}`,
        );
      }
    }
  }

  /**
   * Submits the register_merchant call to Soroban and returns the tx hash.
   * Does NOT wait for confirmation - that's handled by polling.
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

    return sendTxResponse.hash;
  }

  private async logToManualInterventionQueue(
    merchantId: string,
    reason: string,
  ) {
    console.error(
      `[MANUAL INTERVENTION REQUIRED] Merchant ${merchantId} on-chain registration failed: ${reason}`,
    );
    try {
      await prisma.manualIntervention.create({
        data: {
          merchantId,
          issue_type: "onchain_registration_failed",
          description: `On-chain registration failed. Reason: ${reason}`,
        },
      });
    } catch (dbError) {
      console.error(
        `Failed to create manual intervention record for merchant ${merchantId}:`,
        dbError,
      );
    }
  }

  /** Get current queue size for monitoring */
  get queueSize(): number {
    return this.registryQueue.length;
  }
}

export const merchantRegistryService = new MerchantRegistryService();
