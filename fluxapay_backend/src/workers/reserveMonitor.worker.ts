import { Horizon } from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { alertService } from '../services/alert.service';

/**
 * Stellar minimum reserve monitor.
 *
 * Operational accounts (hot wallet, sweep account) must keep enough XLM to
 * cover the base reserve for every subentry (trustlines, signers, open offers).
 * If XLM drops below the required reserve, transactions fail with
 * `op_low_reserve`. This worker periodically checks balances and alerts when
 * the available XLM (or USDC buffer) falls below configurable thresholds.
 */

export interface ReserveMonitorConfig {
  horizonUrl: string;
  networkPassphrase: string;
  /** Base reserve in XLM (0.5 on mainnet/testnet). */
  baseReserve: number;
  /** Extra XLM buffer kept above the minimum reserve. */
  bufferXlm: number;
  /** Warn when available XLM is below this fraction of the required reserve. */
  warningThresholdRatio: number;
  /** Critical when available XLM is below this fraction of the required reserve. */
  criticalThresholdRatio: number;
  /** Minimum USDC balance to keep for operations. */
  minUsdcBalance: number;
  /** Accounts to monitor. */
  accounts: Array<{ label: string; publicKey: string }>;
  /** Interval between checks in milliseconds. */
  intervalMs: number;
}

export interface ReserveCalculation {
  publicKey: string;
  subentries: number;
  trustlines: number;
  signers: number;
  openOffers: number;
  baseReserve: number;
  bufferXlm: number;
  requiredReserve: number;
  availableXlm: number;
  surplusXlm: number;
  usdcBalance: number;
}

export type ReserveStatus = 'ok' | 'warning' | 'critical';

export interface ReserveCheckResult extends ReserveCalculation {
  label: string;
  status: ReserveStatus;
  reasons: string[];
}

const DEFAULT_CONFIG: Omit<ReserveMonitorConfig, 'accounts'> = {
  horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org',
  networkPassphrase:
    process.env.STELLAR_NETWORK_PASSPHRASE ||
    'Public Global Stellar Network ; September 2015',
  baseReserve: Number(process.env.STELLAR_BASE_RESERVE || 0.5),
  bufferXlm: Number(process.env.STELLAR_RESERVE_BUFFER_XLM || 5),
  warningThresholdRatio: Number(process.env.STELLAR_RESERVE_WARNING_RATIO || 1.5),
  criticalThresholdRatio: Number(process.env.STELLAR_RESERVE_CRITICAL_RATIO || 1.1),
  minUsdcBalance: Number(process.env.STELLAR_MIN_USDC_BALANCE || 10),
  intervalMs: Number(process.env.STELLAR_RESERVE_CHECK_INTERVAL_MS || 5 * 60 * 1000),
};

/**
 * Compute the required minimum reserve for an account.
 *
 * Formula: (2 + subentries) * base_reserve + buffer
 * where subentries = trustlines + signers (excluding master key) + open offers.
 */
export function calculateRequiredReserve(params: {
  subentries: number;
  baseReserve: number;
  bufferXlm: number;
}): number {
  const { subentries, baseReserve, bufferXlm } = params;
  const safeSubentries = Math.max(0, Math.floor(subentries));
  return (2 + safeSubentries) * baseReserve + bufferXlm;
}

/**
 * Derive subentry counts from a Horizon account record.
 */
export function countSubentries(account: Horizon.AccountResponse): {
  trustlines: number;
  signers: number;
  openOffers: number;
  subentries: number;
} {
  const trustlines = account.balances.filter(
    (b) => b.asset_type !== 'native',
  ).length;
  // Horizon reports `num_sponsoring`/`num_sponsored` separately; signers array
  // includes the master key, which does not count as a subentry.
  const signers = Math.max(0, (account.signers?.length || 1) - 1);
  const openOffers = account.num_offers ?? 0;
  const subentries = trustlines + signers + openOffers;
  return { trustlines, signers, openOffers, subentries };
}

function getNativeBalance(account: Horizon.AccountResponse): number {
  const native = account.balances.find((b) => b.asset_type === 'native');
  return native ? Number(native.balance) : 0;
}

function getUsdcBalance(account: Horizon.AccountResponse): number {
  const usdc = account.balances.find(
    (b) =>
      b.asset_type !== 'native' &&
      (b as Horizon.HorizonApi.BalanceLineAsset).asset_code === 'USDC',
  );
  return usdc ? Number(usdc.balance) : 0;
}

/**
 * Evaluate a single account against reserve thresholds.
 */
export function evaluateAccount(
  label: string,
  account: Horizon.AccountResponse,
  config: Pick<
    ReserveMonitorConfig,
    'baseReserve' | 'bufferXlm' | 'warningThresholdRatio' | 'criticalThresholdRatio' | 'minUsdcBalance'
  >,
): ReserveCheckResult {
  const { trustlines, signers, openOffers, subentries } = countSubentries(account);
  const requiredReserve = calculateRequiredReserve({
    subentries,
    baseReserve: config.baseReserve,
    bufferXlm: config.bufferXlm,
  });
  const availableXlm = getNativeBalance(account);
  const usdcBalance = getUsdcBalance(account);
  const surplusXlm = availableXlm - requiredReserve;

  const reasons: string[] = [];
  let status: ReserveStatus = 'ok';

  if (availableXlm < requiredReserve * config.criticalThresholdRatio) {
    status = 'critical';
    reasons.push(
      `XLM balance ${availableXlm.toFixed(7)} below critical reserve ${(
        requiredReserve * config.criticalThresholdRatio
      ).toFixed(7)}`,
    );
  } else if (availableXlm < requiredReserve * config.warningThresholdRatio) {
    status = 'warning';
    reasons.push(
      `XLM balance ${availableXlm.toFixed(7)} below warning reserve ${(
        requiredReserve * config.warningThresholdRatio
      ).toFixed(7)}`,
    );
  }

  if (usdcBalance < config.minUsdcBalance) {
    if (status === 'ok') status = 'warning';
    reasons.push(
      `USDC balance ${usdcBalance.toFixed(7)} below minimum ${config.minUsdcBalance}`,
    );
  }

  return {
    label,
    publicKey: account.account_id,
    subentries,
    trustlines,
    signers,
    openOffers,
    baseReserve: config.baseReserve,
    bufferXlm: config.bufferXlm,
    requiredReserve,
    availableXlm,
    surplusXlm,
    usdcBalance,
    status,
    reasons,
  };
}

export class ReserveMonitorWorker {
  private readonly config: ReserveMonitorConfig;
  private readonly server: Horizon.Server;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config?: Partial<ReserveMonitorConfig>) {
    const accounts =
      config?.accounts ??
      [
        process.env.STELLAR_HOT_WALLET_PUBLIC_KEY
          ? { label: 'hot-wallet', publicKey: process.env.STELLAR_HOT_WALLET_PUBLIC_KEY }
          : null,
        process.env.STELLAR_SWEEP_ACCOUNT_PUBLIC_KEY
          ? { label: 'sweep-account', publicKey: process.env.STELLAR_SWEEP_ACCOUNT_PUBLIC_KEY }
          : null,
      ].filter((a): a is { label: string; publicKey: string } => a !== null);

    this.config = { ...DEFAULT_CONFIG, ...config, accounts };
    this.server = new Horizon.Server(this.config.horizonUrl);
  }

  /** Run a single reserve check across all configured accounts. */
  async checkOnce(): Promise<ReserveCheckResult[]> {
    const results: ReserveCheckResult[] = [];

    for (const { label, publicKey } of this.config.accounts) {
      try {
        const account = await this.server.accounts().accountId(publicKey).call();
        const result = evaluateAccount(label, account, this.config);
        results.push(result);

        if (result.status === 'critical') {
          logger.error(
            `[reserve-monitor] CRITICAL ${label} (${publicKey}): ${result.reasons.join('; ')}`,
          );
          await this.notify(result);
        } else if (result.status === 'warning') {
          logger.warn(
            `[reserve-monitor] WARNING ${label} (${publicKey}): ${result.reasons.join('; ')}`,
          );
          await this.notify(result);
        } else {
          logger.info(
            `[reserve-monitor] OK ${label} (${publicKey}): available=${result.availableXlm.toFixed(
              7,
            )} required=${result.requiredReserve.toFixed(7)}`,
          );
        }
      } catch (err) {
        logger.error(
          `[reserve-monitor] Failed to check ${label} (${publicKey}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return results;
  }

  private async notify(result: ReserveCheckResult): Promise<void> {
    try {
      await alertService.send({
        severity: result.status === 'critical' ? 'critical' : 'warning',
        title: `Stellar reserve ${result.status}: ${result.label}`,
        message: result.reasons.join('; '),
        metadata: {
          publicKey: result.publicKey,
          availableXlm: result.availableXlm,
          requiredReserve: result.requiredReserve,
          usdcBalance: result.usdcBalance,
          subentries: result.subentries,
        },
      });
    } catch (err) {
      logger.error(
        `[reserve-monitor] Failed to send alert for ${result.label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Start the scheduled reserve monitor. */
  start(): void {
    if (this.timer) return;
    if (this.config.accounts.length === 0) {
      logger.warn('[reserve-monitor] No accounts configured; monitor not started');
      return;
    }

    const run = async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.checkOnce();
      } finally {
        this.running = false;
      }
    };

    void run();
    this.timer = setInterval(() => void run(), this.config.intervalMs);
    logger.info(
      `[reserve-monitor] Started with interval ${this.config.intervalMs}ms for ${this.config.accounts.length} account(s)`,
    );
  }

  /** Stop the scheduled reserve monitor. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[reserve-monitor] Stopped');
    }
  }
}

export const reserveMonitorWorker = new ReserveMonitorWorker();
