import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
  Memo,
  TransactionBuilderOptions,
} from '@stellar/stellar-sdk';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Default threshold (in seconds) after which an unconfirmed transaction is
 * considered stuck and eligible for fee bumping.
 */
export const DEFAULT_FEE_BUMP_TIMEOUT_SECONDS = 60;

/**
 * Default maximum fee (in stroops) that a fee bump is allowed to reach.
 * This is a hard ceiling to prevent runaway fee costs.
 */
export const DEFAULT_MAX_FEE_STROOPS = 10_000_000; // 1 XLM

/**
 * Default multiplier applied to the original fee when bumping.
 */
export const DEFAULT_FEE_BUMP_MULTIPLIER = 2;

export interface FeeBumpOptions {
  /** Base fee (stroops) of the original transaction. */
  baseFee?: number;
  /** Multiplier applied to the current fee. Defaults to DEFAULT_FEE_BUMP_MULTIPLIER. */
  multiplier?: number;
  /** Absolute maximum fee (stroops) allowed for the fee bump. */
  maxFee?: number;
}

export interface FeeBumpResult {
  /** The signed fee-bump transaction envelope (base64 XDR). */
  envelopeXdr: string;
  /** The fee-bump transaction hash. */
  hash: string;
  /** The original (inner) transaction hash. */
  innerHash: string;
  /** The max fee (stroops) applied to the fee bump. */
  maxFee: number;
}

export interface StuckTransaction {
  hash: string;
  envelopeXdr: string;
  createdAt: number;
  feeCharged?: number;
}

export class StellarService {
  private server: Horizon.Server;
  private networkPassphrase: string;

  constructor(
    horizonUrl: string = config.stellar.horizonUrl,
    networkPassphrase: string = config.stellar.networkPassphrase,
  ) {
    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase = networkPassphrase;
  }

  /**
   * Compute the bumped max fee, enforcing the configured ceiling.
   *
   * @throws if the computed fee would exceed the ceiling.
   */
  public computeBumpedFee(
    currentFee: number,
    options: FeeBumpOptions = {},
  ): number {
    const multiplier = options.multiplier ?? DEFAULT_FEE_BUMP_MULTIPLIER;
    const ceiling = options.maxFee ?? DEFAULT_MAX_FEE_STROOPS;

    if (currentFee <= 0) {
      throw new Error('Current fee must be greater than zero');
    }
    if (multiplier <= 1) {
      throw new Error('Fee bump multiplier must be greater than 1');
    }

    const bumped = Math.ceil(currentFee * multiplier);

    if (bumped > ceiling) {
      throw new Error(
        `Fee bump of ${bumped} stroops exceeds maximum ceiling of ${ceiling} stroops`,
      );
    }

    return bumped;
  }

  /**
   * Build and sign a FeeBumpTransactionEnvelope for a stuck transaction.
   *
   * @param innerEnvelopeXdr Base64 XDR of the original transaction envelope.
   * @param feeSourceKeypair Keypair that will pay the bumped fee.
   * @param options Fee bump configuration (multiplier, ceiling).
   */
  public buildFeeBumpTransaction(
    innerEnvelopeXdr: string,
    feeSourceKeypair: Keypair,
    options: FeeBumpOptions = {},
  ): FeeBumpResult {
    const innerTx = TransactionBuilder.fromXDR(
      innerEnvelopeXdr,
      this.networkPassphrase,
    );

    if (innerTx instanceof FeeBumpTransaction) {
      throw new Error('Cannot fee-bump an already fee-bumped transaction');
    }

    const innerTransaction = innerTx as Transaction;
    const currentFee = innerTransaction.fee;

    const bumpedFee = this.computeBumpedFee(currentFee, options);

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      feeSourceKeypair,
      bumpedFee.toString(),
      innerTransaction,
      this.networkPassphrase,
    );

    feeBumpTx.sign(feeSourceKeypair);

    return {
      envelopeXdr: feeBumpTx.toEnvelope().toXDR('base64'),
      hash: feeBumpTx.hash().toString('hex'),
      innerHash: innerTransaction.hash().toString('hex'),
      maxFee: bumpedFee,
    };
  }

  /**
   * Submit a signed fee-bump transaction envelope to Horizon.
   */
  public async submitFeeBumpTransaction(
    envelopeXdr: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const tx = TransactionBuilder.fromXDR(
      envelopeXdr,
      this.networkPassphrase,
    );

    if (!(tx instanceof FeeBumpTransaction)) {
      throw new Error('Envelope is not a fee-bump transaction');
    }

    try {
      const response = await this.server.submitTransaction(tx);
      logger.info('Fee-bump transaction submitted', {
        hash: response.hash,
      });
      return response;
    } catch (error) {
      logger.error('Failed to submit fee-bump transaction', { error });
      throw error;
    }
  }

  /**
   * Fetch a transaction from Horizon and determine whether it is still
   * unconfirmed after the given timeout threshold.
   */
  public async findStuckTransaction(
    hash: string,
    submittedAt: number,
    timeoutSeconds: number = DEFAULT_FEE_BUMP_TIMEOUT_SECONDS,
  ): Promise<StuckTransaction | null> {
    const ageSeconds = (Date.now() - submittedAt) / 1000;
    if (ageSeconds < timeoutSeconds) {
      return null;
    }

    try {
      const tx = await this.server.transactions().transaction(hash).call();
      if (tx.successful) {
        return null;
      }
    } catch (error: any) {
      // 404 means the transaction is not yet confirmed on the network.
      if (error?.response?.status !== 404) {
        logger.warn('Error checking transaction status', { hash, error });
        return null;
      }
    }

    return {
      hash,
      envelopeXdr: '',
      createdAt: submittedAt,
    };
  }

  /**
   * Detect and fee-bump a set of candidate transactions that have exceeded
   * the confirmation timeout. Returns the fee-bump results for those that
   * were successfully bumped.
   */
  public async processStuckTransactions(
    candidates: Array<{ hash: string; envelopeXdr: string; submittedAt: number }>,
    feeSourceKeypair: Keypair,
    options: FeeBumpOptions & { timeoutSeconds?: number } = {},
  ): Promise<FeeBumpResult[]> {
    const timeoutSeconds =
      options.timeoutSeconds ?? DEFAULT_FEE_BUMP_TIMEOUT_SECONDS;
    const results: FeeBumpResult[] = [];

    for (const candidate of candidates) {
      const stuck = await this.findStuckTransaction(
        candidate.hash,
        candidate.submittedAt,
        timeoutSeconds,
      );

      if (!stuck) {
        continue;
      }

      try {
        const result = this.buildFeeBumpTransaction(
          candidate.envelopeXdr,
          feeSourceKeypair,
          options,
        );
        results.push(result);
      } catch (error) {
        logger.error('Failed to build fee-bump transaction', {
          hash: candidate.hash,
          error,
        });
      }
    }

    return results;
  }
}

export const stellarService = new StellarService();
