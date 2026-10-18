import {
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  Account,
  Networks,
  BASE_FEE,
  xdr,
  Keypair,
} from '@stellar/stellar-sdk';

export interface SorobanSimulationResourceUsage {
  cpuInsns: string;
  memBytes: string;
  minResourceFee: string;
  footprint: {
    readOnly: string[];
    readWrite: string[];
  };
}

export interface SorobanSimulationAuthEntry {
  credentials: string;
  rootInvocation: string;
  signatureCount: number;
}

export interface SorobanSimulationError {
  code: string;
  message: string;
  detail?: string;
}

export interface SorobanSimulationResult {
  success: boolean;
  /** Estimated resource fee (in stroops) derived from simulation results. */
  resourceFee: string;
  /** Total fee (base fee + resource fee) in stroops. */
  totalFee: string;
  resourceUsage?: SorobanSimulationResourceUsage;
  auth?: SorobanSimulationAuthEntry[];
  errors: SorobanSimulationError[];
  /** The raw simulation response, useful for building the final transaction. */
  raw?: SorobanRpc.Api.SimulateTransactionResponse;
}

/**
 * Maps Soroban simulation error codes to human-readable, actionable messages.
 */
const SIMULATION_ERROR_MESSAGES: Record<string, string> = {
  '1': 'Contract invocation failed during simulation (host error).',
  '2': 'Contract invocation failed during simulation (host error).',
  '3': 'Contract invocation failed during simulation (host error).',
  '4': 'Contract invocation failed during simulation (host error).',
  '5': 'Contract invocation failed during simulation (host error).',
  '6': 'Contract invocation failed during simulation (host error).',
  '7': 'Contract invocation failed during simulation (host error).',
  '8': 'Contract invocation failed during simulation (host error).',
  '9': 'Contract invocation failed during simulation (host error).',
  '10': 'Contract invocation failed during simulation (host error).',
  '11': 'Contract invocation failed during simulation (host error).',
  '12': 'Contract invocation failed during simulation (host error).',
  '13': 'Contract invocation failed during simulation (host error).',
  '14': 'Contract invocation failed during simulation (host error).',
  '15': 'Contract invocation failed during simulation (host error).',
  '16': 'Contract invocation failed during simulation (host error).',
  '17': 'Contract invocation failed during simulation (host error).',
  '18': 'Contract invocation failed during simulation (host error).',
  '19': 'Contract invocation failed during simulation (host error).',
  '20': 'Contract invocation failed during simulation (host error).',
};

function formatSimulationError(err: unknown): SorobanSimulationError {
  if (typeof err === 'string') {
    return { code: 'SIMULATION_ERROR', message: err };
  }

  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    const code = String(anyErr.code ?? anyErr.type ?? 'SIMULATION_ERROR');
    const message =
      (anyErr.message as string) ??
      SIMULATION_ERROR_MESSAGES[code] ??
      'Soroban simulation failed.';
    const detail =
      (anyErr.detail as string) ??
      (anyErr.data as string) ??
      (anyErr.error as string) ??
      undefined;
    return { code, message, detail };
  }

  return { code: 'SIMULATION_ERROR', message: 'Soroban simulation failed.' };
}

function parseAuthEntries(
  auth: xdr.SorobanAuthorizationEntry[] | undefined,
): SorobanSimulationAuthEntry[] {
  if (!auth || auth.length === 0) {
    return [];
  }

  return auth.map((entry) => {
    const credentials = entry.credentials().switch().name;
    const rootInvocation = entry.rootInvocation().function().switch().name;
    const signatureCount = entry.credentials().switch().name === 'sorobanCredentialsAddress' ? 1 : 0;
    return { credentials, rootInvocation, signatureCount };
  });
}

function parseResourceUsage(
  response: SorobanRpc.Api.SimulateTransactionSuccessResponse,
): SorobanSimulationResourceUsage | undefined {
  const cost = response.cost;
  if (!cost) {
    return undefined;
  }

  const footprint = response.transactionData?.build().resources().footprint();
  const readOnly = footprint
    ? footprint.readOnly().map((entry) => entry.toXDR('base64'))
    : [];
  const readWrite = footprint
    ? footprint.readWrite().map((entry) => entry.toXDR('base64'))
    : [];

  return {
    cpuInsns: cost.cpuInsns,
    memBytes: cost.memBytes,
    minResourceFee: response.minResourceFee ?? '0',
    footprint: { readOnly, readWrite },
  };
}

/**
 * Runs a pre-flight `simulateTransaction` for a Soroban contract invocation.
 *
 * This must be called before signing and broadcasting any contract invocation
 * so that execution errors, authorization requirements, and resource
 * consumption are surfaced with actionable details instead of generic network
 * errors.
 */
export async function simulateSorobanTransaction(
  server: SorobanRpc.Server,
  transaction: Transaction,
): Promise<SorobanSimulationResult> {
  let response: SorobanRpc.Api.SimulateTransactionResponse;

  try {
    response = await server.simulateTransaction(transaction);
  } catch (error) {
    return {
      success: false,
      resourceFee: '0',
      totalFee: String(BASE_FEE),
      errors: [
        {
          code: 'SIMULATION_REQUEST_FAILED',
          message: 'Failed to reach Soroban RPC for simulation.',
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  if (SorobanRpc.Api.isSimulationError(response)) {
    return {
      success: false,
      resourceFee: '0',
      totalFee: String(BASE_FEE),
      errors: [formatSimulationError(response.error)],
      raw: response,
    };
  }

  if (SorobanRpc.Api.isSimulationRestore(response)) {
    return {
      success: false,
      resourceFee: response.restorePreamble?.minResourceFee ?? '0',
      totalFee: String(BASE_FEE),
      errors: [
        {
          code: 'SIMULATION_RESTORE_REQUIRED',
          message:
            'Contract state requires restoration before invocation. Submit a restore operation first.',
          detail: response.restorePreamble?.transactionData
            ? 'Restore preamble available in simulation response.'
            : undefined,
        },
      ],
      raw: response,
    };
  }

  const successResponse = response as SorobanRpc.Api.SimulateTransactionSuccessResponse;
  const resourceUsage = parseResourceUsage(successResponse);
  const auth = parseAuthEntries(successResponse.result?.auth);
  const resourceFee = successResponse.minResourceFee ?? '0';
  const totalFee = String(BigInt(BASE_FEE) + BigInt(resourceFee));

  return {
    success: true,
    resourceFee,
    totalFee,
    resourceUsage,
    auth,
    errors: [],
    raw: response,
  };
}

/**
 * Builds, simulates, and (only on success) prepares a Soroban contract
 * invocation transaction for signing and broadcast.
 *
 * Throws an actionable error when simulation fails so callers never broadcast
 * a transaction that is known to fail on-chain.
 */
export async function prepareSorobanInvocation(
  server: SorobanRpc.Server,
  sourceAccount: Account,
  buildOperation: (builder: TransactionBuilder) => TransactionBuilder,
  networkPassphrase: string = Networks.TESTNET,
): Promise<{ transaction: Transaction; simulation: SorobanSimulationResult }> {
  const builder = new TransactionBuilder(sourceAccount, {
    fee: String(BASE_FEE),
    networkPassphrase,
  });

  const built = buildOperation(builder).setTimeout(30).build();
  const simulation = await simulateSorobanTransaction(server, built);

  if (!simulation.success) {
    const details = simulation.errors
      .map((e) => `${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ''}`)
      .join('; ');
    throw new Error(`Soroban pre-flight simulation failed: ${details}`);
  }

  const prepared = SorobanRpc.assembleTransaction(built, simulation.raw!);
  return { transaction: prepared.build(), simulation };
}

export function createSorobanServer(rpcUrl: string): SorobanRpc.Server {
  return new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
}

export function keypairFromSecret(secret: string): Keypair {
  return Keypair.fromSecret(secret);
}
