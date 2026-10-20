/**
 * Types for Soroban contract invocation pre-flight simulation.
 *
 * These mirror the subset of the Soroban RPC `simulateTransaction`
 * response that the backend inspects before signing and broadcasting
 * a contract invocation.
 */

/** Resource consumption reported by a Soroban simulation. */
export interface SorobanResourceUsage {
  /** CPU instructions consumed by the invocation. */
  cpuInsns: string;
  /** Memory bytes consumed by the invocation. */
  memBytes: string;
}

/** Ledger footprint (read/write entries) required by the invocation. */
export interface SorobanFootprint {
  readOnly?: string[];
  readWrite?: string[];
}

/** Resource footprint and fee estimate derived from a simulation. */
export interface SorobanSimulationResources {
  /** Estimated resource fee in stroops, populated from simulation results. */
  fee: string;
  /** Resource usage (CPU / memory) reported by the simulation. */
  resources: SorobanResourceUsage;
  /** Ledger footprint required by the invocation. */
  footprint?: SorobanFootprint;
}

/** A single authorization requirement surfaced by a simulation. */
export interface SorobanAuthTrace {
  /** Human-readable description of the auth requirement. */
  description: string;
  /** Optional address that must authorize the invocation. */
  address?: string;
  /** Optional raw auth entry for debugging. */
  raw?: unknown;
}

/** Structured, actionable error produced when a simulation fails. */
export interface SorobanSimulationError {
  /** Soroban error code, when the RPC provides one. */
  code?: string;
  /** Human-readable, actionable message. */
  message: string;
  /** Authorization traces / requirements, when relevant. */
  authTraces?: SorobanAuthTrace[];
  /** Raw error payload for debugging. */
  raw?: unknown;
}

/** Normalized result of a Soroban pre-flight simulation. */
export interface SorobanSimulationResult {
  /** Whether the invocation is expected to succeed on-chain. */
  success: boolean;
  /** Populated when `success` is true. */
  resources?: SorobanSimulationResources;
  /** Populated when `success` is false. */
  error?: SorobanSimulationError;
}

/** Raw shape of a Soroban RPC `simulateTransaction` response. */
export interface SorobanSimulateTransactionResponse {
  /** Latest ledger sequence the simulation ran against. */
  latestLedger?: number;
  /** Base64-encoded transaction data (footprint) to attach on submit. */
  transactionData?: string;
  /** Minimum resource fee in stroops. */
  minResourceFee?: string;
  /** Cost / resource usage reported by the simulation. */
  cost?: {
    cpuInsns?: string;
    memBytes?: string;
  };
  /** Results of the simulated invocation. */
  results?: Array<{
    auth?: unknown[];
    xdr?: string;
  }>;
  /** Error string returned by the RPC, if the simulation failed. */
  error?: string;
  /** Events emitted during simulation (unused, kept for completeness). */
  events?: unknown[];
}
