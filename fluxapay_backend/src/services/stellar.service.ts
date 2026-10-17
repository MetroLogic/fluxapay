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
  SorobanRpc,
  Contract,
  xdr,
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

/**
 * Resource consumption reported by a Soroban simulation.
 */
export interface SorobanResourceUsage {
  /** CPU instructions consumed by the invocation. */
  cpuInsns: string;
  /** Memory (bytes) consumed by the invocation. */
  memBytes: string;
  /** Number of ledger entries read/written (footprint size). */
  footprintEntries: number;
}

/**
 * Actionable details describing why a Soroban simulation failed.
 */
export interface SorobanSimulationError {
  /** Raw Soroban error code, if the RPC returned one. */
  code?: string;
  /** Human-readable message describing the failure. */
  message: string;
  /** Authorization traces / requirements surfaced by the simulation. */
  authTraces: string[];
  /** Resource usage observed during the (failed) simulation, if any. */
  resources?: SorobanResourceUsage;
}

export interface SorobanSimulationResult {
  /** Whether the simulation completed without execution errors. */
  success: boolean;
  /** Estimated resource fee (stroops) derived from the simulation. */
  resourceFee: number;
  /** Minimum resource fee (stroops) reported by the RPC. */
  minResourceFee: number;
  /** Resource consumption observed during simulation. */
  resources: SorobanResourceUsage;
  /** Authorization requirements surfaced by the simulation. */
  authRequirements: string[];
  /** Populated only when `success` is false. */
  error?: SorobanSimulationError;
  /** The raw simulation response for advanced callers. */
  raw: SorobanRpc.Api.SimulateTransactionResponse;
}

/**
 * Thrown when a Soroban pre-flight simulation fails. Carries structured,
 * actionable details instead of a generic network error.
 */
export class SorobanSimulationError extends Error {
  public readonly code?: string;
  public readonly authTraces: string[];
  public readonly resources?: SorobanResourceUsage;

  constructor(details: SorobanSimulationError) {
    super(details.message);
    this.name = 'SorobanSimulationError';
    this.code = details.code;
    this.authTraces = details.authTraces;
    this.resources = details.resources;
  }
}

export class StellarService {
  private server: Horizon.Server;
  private sorobanServer: SorobanRpc.Server;
  private networkPassphrase: string;

  constructor(
    horizonUrl: string = config.stellar.horizonUrl,
    networkPassphrase: string = config.stellar.networkPassphrase,
    sorobanRpcUrl: string = config.stellar.sorobanRpcUrl ?? horizonUrl,
  ) {
    this.server = new Horizon.Server(horizonUrl);
    this.sorobanServer = new SorobanRpc.Server(sorobanRpcUrl);
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

  /**
   * Run a Soroban pre-flight simulation for a contract invocation and return
   * structured results including resource usage, auth requirements, and the
   * dynamically estimated resource fee.
   *
   * This must be called before signing and broadcasting any Soroban contract
   * invocation so that failing transactions are never submitted on-chain.
   */
  public async simulateContractInvocation(
    tx: Transaction,
  ): Promise<SorobanSimulationResult> {
    let response: SorobanRpc.Api.SimulateTransactionResponse;
    try {
      response = await this.sorobanServer.simulateTransaction(tx);
    } catch (error: any) {
      logger.error('Soroban simulation RPC call failed', { error });
      throw new SorobanSimulationError({
        message: `Soroban simulation request failed: ${
          error?.message ?? 'unknown error'
        }`,
        authTraces: [],
      });
    }

    return this.parseSimulationResponse(response);
  }

  /**
   * Parse a raw Soroban simulation response into a structured result,
   * formatting error codes, auth traces, and resource consumption.
   */
  public parseSimulationResponse(
    response: SorobanRpc.Api.SimulateTransactionResponse,
  ): SorobanSimulationResult {
    const resources = this.extractResources(response);
    const authRequirements = this.extractAuthRequirements(response);
    const minResourceFee = this.extractMinResourceFee(response);

    if (SorobanRpc.Api.isSimulationError(response)) {
      const error = this.formatSimulationError(
        response,
        resources,
        authRequirements,
      );
      logger.warn('Soroban simulation failed', {
        code: error.code,
        message: error.message,
      });
      return {
        success: false,
        resourceFee: minResourceFee,
        minResourceFee,
        resources,
        authRequirements,
        error,
        raw: response,
      };
    }

    return {
      success: true,
      resourceFee: minResourceFee,
      minResourceFee,
      resources,
      authRequirements,
      raw: response,
    };
  }

  /**
   * Simulate a contract invocation and throw a structured
   * SorobanSimulationError if the simulation fails. Returns the simulation
   * result (with the estimated resource fee) on success.
   */
  public async preflightContractInvocation(
    tx: Transaction,
  ): Promise<SorobanSimulationResult> {
    const result = await this.simulateContractInvocation(tx);
    if (!result.success && result.error) {
      throw new SorobanSimulationError(result.error);
    }
    return result;
  }

  private extractResources(
    response: SorobanRpc.Api.SimulateTransactionResponse,
  ): SorobanResourceUsage {
    const cost =
      'cost' in response && response.cost
        ? response.cost
        : undefined;
    const footprintEntries =
      'transactionData' in response && response.transactionData
        ? this.countFootprintEntries(response.transactionData)
        : 0;

    return {
      cpuInsns: cost?.cpuInsns ?? '0',
      memBytes: cost?.memBytes ?? '0',
      footprintEntries,
    };
  }

  private countFootprintEntries(transactionData: string): number {
    try {
      const sorobanData = xdr.SorobanTransactionData.fromXDR(
        transactionData,
        'base64',
      );
      const footprint = sorobanData.resources().footprint();
      return (
        footprint.readOnly().length + footprint.readWrite().length
      );
    } catch {
      return 0;
    }
  }

  private extractAuthRequirements(
    response: SorobanRpc.Api.SimulateTransactionResponse,
  ): string[] {
    if (!('result' in response) || !response.result) {
      return [];
    }
    try {
      const auth = response.result.auth ?? [];
      return auth.map((entry) => entry.toXDR('base64'));
    } catch {
      return [];
    }
  }

  private extractMinResourceFee(
    response: SorobanRpc.Api.SimulateTransactionResponse,
  ): number {
    if (!('minResourceFee' in response) || !response.minResourceFee) {
      return 0;
    }
    const parsed = Number(response.minResourceFee);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatSimulationError(
    response: SorobanRpc.Api.SimulateTransactionErrorResponse,
    resources: SorobanResourceUsage,
    authRequirements: string[],
  ): SorobanSimulationError {
    const rawError = response.error;
    const code = this.extractErrorCode(rawError);
    const authTraces = this.extractAuthTraces(rawError, authRequirements);

    const message = code
      ? `Soroban simulation failed [${code}]: ${rawError}`
      : `Soroban simulation failed: ${rawError}`;

    return {
      code,
      message,
      authTraces,
      resources,
    };
  }

  private extractErrorCode(rawError: string): string | undefined {
    // Soroban RPC errors are typically formatted as "HostError: Error(Contract, #N)"
    // or "Error(Auth, InvalidAction)". Extract the bracketed category/code.
    const match = rawError.match(/Error\(([^)]+)\)/);
    if (match) {
      return match[1].trim();
    }
    return undefined;
  }

  private extractAuthTraces(
    rawError: string,
    authRequirements: string[],
  ): string[] {
    const traces: string[] = [];
    if (/auth/i.test(rawError)) {
      traces.push(rawError);
    }
    for (const requirement of authRequirements) {
      traces.push(`required-auth: ${requirement}`);
    }
    return traces;
  }
}

export const stellarService = new StellarService();
