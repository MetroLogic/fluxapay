import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
} from "@stellar/stellar-sdk";
import { HDWalletService } from "./HDWalletService";
import { getLogger, getMetricsCollector } from "../utils/logger";

export class StellarService {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private funderKeypair: Keypair;
  private hdWalletService: HDWalletService;
  private usdcIssuer: string;
  private readonly logger = getLogger("StellarService");
  private readonly metrics = getMetricsCollector();
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000;

  constructor() {
    const horizonUrl =
      process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
    this.networkPassphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
    this.server = new Horizon.Server(horizonUrl);

    const funderSecret = process.env.FUNDER_SECRET_KEY;
    if (!funderSecret) {
      throw new Error("FUNDER_SECRET_KEY is required in environment variables");
    }
    this.funderKeypair = Keypair.fromSecret(funderSecret);

    // Initialize HDWalletService with KMS support
    // For backward compatibility, still support direct seed injection in tests
    const masterSeed = process.env.HD_WALLET_MASTER_SEED;
    if (masterSeed) {
      // Legacy mode: direct seed injection (for tests)
      this.hdWalletService = new HDWalletService(masterSeed);
    } else {
      // Production mode: use KMS
      this.hdWalletService = new HDWalletService();
    }

    // Default to testnet USDC issuer or override
    this.usdcIssuer =
      process.env.USDC_ISSUER_PUBLIC_KEY ||
      "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
  }

  // Allow injecting a mock HDWalletService for testing or different config
  public setHDWalletService(service: HDWalletService) {
    this.hdWalletService = service;
  }

  /**
   * Checks if a Stellar account exists on-chain.
   * @param publicKey The public key (address) to check.
   * @returns true if the account exists, false otherwise.
   */
  public async checkAccountExists(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Funds an account with a starting balance and establishes a trustline to USDC.
   * Handles the account merge edge case (if it already exists, just checks/adds trustline).
   * @param merchantId The merchant ID
   * @param paymentId The payment ID
   */
  public async prepareAccount(
    merchantId: string,
    paymentId: string,
  ): Promise<void> {
    const derivedKeypairInfo = await this.hdWalletService.regenerateKeypair(
      merchantId,
      paymentId,
    );
    const destinationPublicKey = derivedKeypairInfo.publicKey;
    const destinationSecretKey = derivedKeypairInfo.secretKey;

    const exists = await this.checkAccountExists(destinationPublicKey);

    if (!exists) {
      // 1. Create and Fund Account with retry logic
      this.logger.info("Creating and funding account", {
        publicKey: destinationPublicKey,
        merchantId,
        paymentId,
      });
      await this.createAndFundAccountWithRetry(destinationPublicKey, "2.0");
    }

    // 2. Check and Add Trustline with retry logic
    const hasTrustline = await this.checkTrustline(
      destinationPublicKey,
      "USDC",
      this.usdcIssuer,
    );

    if (!hasTrustline) {
      this.logger.info("Adding USDC trustline", {
        publicKey: destinationPublicKey,
        merchantId,
        paymentId,
      });
      await this.addTrustlineWithRetry(
        destinationSecretKey,
        "USDC",
        this.usdcIssuer,
      );
    } else {
      this.logger.debug("Account already has USDC trustline", {
        publicKey: destinationPublicKey,
      });
    }
  }

  /**
   * Creates a new account and funds it from the funder wallet.
   * @param destination The public key of the new account.
   * @param startingBalance The amount of XLM to send.
   */
  private async createAndFundAccount(
    destination: string,
    startingBalance: string,
  ): Promise<void> {
    // Load the funder account
    const funderAccountResponse = await this.server.loadAccount(
      this.funderKeypair.publicKey(),
    );

    // Build the transaction
    const transaction = new TransactionBuilder(funderAccountResponse, {
      fee: "100", // Basic fee
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.createAccount({
          destination: destination,
          startingBalance: startingBalance,
        }),
      )
      .setTimeout(30)
      .build();

    // Sign the transaction with the funder's secret key
    transaction.sign(this.funderKeypair);

    // Submit the transaction
    try {
      await this.server.submitTransaction(transaction);
    } catch (error: any) {
      this.logger.error("Error creating account", {
        error: { message: error.message, response: error.response?.data },
        destination,
        startingBalance,
      });
      throw error;
    }
  }

  /**
   * Checks if an account has a trustline for a specific asset.
   */
  public async checkTrustline(
    publicKey: string,
    assetCode: string,
    assetIssuer: string,
  ): Promise<boolean> {
    try {
      const account = await this.server.loadAccount(publicKey);
      const balances = account.balances;

      for (const balance of balances) {
        if (
          "asset_code" in balance &&
          balance.asset_code === assetCode &&
          "asset_issuer" in balance &&
          balance.asset_issuer === assetIssuer
        ) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error("Error checking trustline", {
        error: { message: (error as Error).message },
        publicKey,
        assetCode,
        assetIssuer,
      });
      throw error;
    }
  }

  /**
   * Adds a trustline to a specific asset.
   * @param secretKey The secret key of the account establishing the trustline.
   * @param assetCode The code of the asset (e.g., "USDC").
   * @param assetIssuer The issuer's public key.
   */
  private async addTrustline(
    secretKey: string,
    assetCode: string,
    assetIssuer: string,
  ): Promise<void> {
    const keypair = Keypair.fromSecret(secretKey);
    const accountResponse = await this.server.loadAccount(keypair.publicKey());
    const asset = new Asset(assetCode, assetIssuer);

    const transaction = new TransactionBuilder(accountResponse, {
      fee: "100",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: asset,
        }),
      )
      .setTimeout(30)
      .build();

    transaction.sign(keypair);

    try {
      await this.server.submitTransaction(transaction);
    } catch (error: any) {
      this.logger.error("Error adding trustline", {
        error: { message: error.message, response: error.response?.data },
        publicKey: keypair.publicKey(),
        assetCode,
        assetIssuer,
      });
      throw error;
    }
  }

  /**
   * Wrapper for createAndFundAccount with retry logic and exponential backoff.
   */
  private async createAndFundAccountWithRetry(
    destination: string,
    startingBalance: string,
  ): Promise<void> {
    return this.retryWithBackoff(
      () => this.createAndFundAccount(destination, startingBalance),
      "createAndFundAccount",
      { destination, startingBalance },
    );
  }

  /**
   * Wrapper for addTrustline with retry logic and exponential backoff.
   */
  private async addTrustlineWithRetry(
    secretKey: string,
    assetCode: string,
    assetIssuer: string,
  ): Promise<void> {
    return this.retryWithBackoff(
      () => this.addTrustline(secretKey, assetCode, assetIssuer),
      "addTrustline",
      { assetCode, assetIssuer },
    );
  }

  /**
   * Generic retry wrapper with exponential backoff for Horizon operations.
   * Classifies errors and determines if retry is appropriate.
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    context: Record<string, any>,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await operation();

        // Track successful operation
        this.metrics.increment("stellar.operation.success", {
          operation: operationName,
          attempt: attempt.toString(),
        });

        if (attempt > 1) {
          this.logger.info("Operation succeeded after retry", {
            operation: operationName,
            attempt,
            ...context,
          });
        }

        return result;
      } catch (error: any) {
        lastError = error;
        const errorType = this.classifyError(error);

        this.logger.warn("Stellar operation failed", {
          operation: operationName,
          attempt,
          maxRetries: this.MAX_RETRIES,
          errorType,
          errorMessage: error.message,
          errorResponse: error.response?.data,
          ...context,
        });

        this.metrics.increment("stellar.operation.failure", {
          operation: operationName,
          attempt: attempt.toString(),
          errorType,
        });

        // Check if error is retryable
        if (!this.isRetryableError(errorType)) {
          this.logger.error("Non-retryable error encountered", {
            operation: operationName,
            errorType,
            errorMessage: error.message,
            ...context,
          });
          throw error;
        }

        // Check for insufficient funder balance
        if (errorType === "INSUFFICIENT_BALANCE") {
          this.logger.error("ALERT: Funder account has insufficient balance", {
            operation: operationName,
            funderPublicKey: this.funderKeypair.publicKey(),
            ...context,
          });
          this.metrics.increment("stellar.funder.insufficient_balance");
          throw new Error(`Insufficient funder balance: ${error.message}`);
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= this.MAX_RETRIES) {
          this.logger.error("Max retries exceeded", {
            operation: operationName,
            attempts: attempt,
            errorType,
            ...context,
          });
          throw new Error(
            `${operationName} failed after ${this.MAX_RETRIES} attempts: ${error.message}`,
          );
        }

        // Exponential backoff with jitter
        const delay = this.BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * delay; // Add up to 30% jitter
        const totalDelay = delay + jitter;

        this.logger.info("Retrying operation after delay", {
          operation: operationName,
          attempt,
          delayMs: Math.round(totalDelay),
          ...context,
        });

        await this.sleep(totalDelay);
      }
    }

    throw lastError;
  }

  /**
   * Classifies Horizon errors into categories for better handling.
   */
  private classifyError(error: any): string {
    if (!error.response) {
      return "NETWORK_ERROR";
    }

    const status = error.response.status;
    const data = error.response.data;

    // HTTP status-based classification
    if (status === 504 || status === 503) {
      return "HORIZON_TIMEOUT";
    }

    if (status === 429) {
      return "RATE_LIMIT";
    }

    if (status >= 500) {
      return "HORIZON_SERVER_ERROR";
    }

    // Transaction-specific errors
    if (data?.extras?.result_codes) {
      const txCode = data.extras.result_codes.transaction;
      const opCodes = data.extras.result_codes.operations || [];

      if (
        txCode === "tx_insufficient_balance" ||
        opCodes.includes("op_underfunded")
      ) {
        return "INSUFFICIENT_BALANCE";
      }

      if (txCode === "tx_bad_seq") {
        return "SEQUENCE_ERROR";
      }

      if (opCodes.includes("op_already_exists")) {
        return "ACCOUNT_EXISTS";
      }

      if (opCodes.includes("op_no_trust")) {
        return "NO_TRUSTLINE";
      }
    }

    return "UNKNOWN_ERROR";
  }

  /**
   * Determines if an error type is retryable.
   */
  private isRetryableError(errorType: string): boolean {
    const retryableErrors = [
      "NETWORK_ERROR",
      "HORIZON_TIMEOUT",
      "HORIZON_SERVER_ERROR",
      "RATE_LIMIT",
      "SEQUENCE_ERROR", // Sequence errors can be retried as they auto-resolve
    ];

    return retryableErrors.includes(errorType);
  }

  /**
   * Sleep utility for delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
