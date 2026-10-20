import { Horizon } from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';

/**
 * Stellar account minimum reserve monitor.
 *
 * Required minimum reserve formula:
 *   (2 + subentries) * base_reserve + buffer
 * where subentries = trustlines + signers (excluding master key) + open offers + data entries.
 */

export interface ReserveMonitorConfig {
  horizonUrl: string;
  networkPassphrase?: string;
  /** Base reserve in XLM (default 0.5 on mainnet). */
  baseReserveXlm?: number;
  /** Extra safety buffer in XLM added on top of the computed reserve. */
  bufferXlm?: number;
  /** Warn when available XLM falls below required reserve * warningMultiplier. */
  warningMultiplier?: number;
  /** Minimum USDC balance to keep for operations. */
  minUsdcBalance?: number;
  /** Accounts to monitor (hot wallet, sweep account, etc.). */
  accounts: string[];
  /** Optional alert sink; defaults to warning log. */
  alert?: (message: string, context: Record<string, unknown>) => Promise<void> | void;
}

export interface AccountReserveState {
  accountId: string;
  xlmBalance: number;
  usdcBalance: number;
  subentries: number;
  trustlines: number;
  signers: number;
  offers: number;
  dataEntries: number;
  baseReserveXlm: number;
  bufferXlm: number;
  requiredReserveXlm: number;
  availableXlm: number;
  status: 'ok' | 'warning' | 'critical';
}

export interface ReserveCheckResult {
  checkedAt: string;
  accounts: AccountReserveState[];
  alerts: string[];
}

const DEFAULT_BASE_RESERVE_XLM = 0.5;
const DEFAULT_BUFFER_XLM = 1;
const DEFAULT_WARNING_MULTIPLIER = 1.5;
const DEFAULT_MIN_USDC = 0;
const USDC_ASSET_CODE = 'USDC';

/**
 * Pure reserve calculation. Exposed for unit testing across varying subentry counts.
 */
export function calculateRequiredReserve(
  subentries: number,
  baseReserveXlm: number = DEFAULT_BASE_RESERVE_XLM,
  bufferXlm: number = DEFAULT_BUFFER_XLM,
): number {
  const safeSubentries = Math.max(0, Math.floor(subentries));
  return (2 + safeSubentries) * baseReserveXlm + bufferXlm;
}

function countSubentries(account: Horizon.AccountResponse): {
  trustlines: number;
  signers: number;
  offers: number;
  dataEntries: number;
  total: number;
} {
  const trustlines = account.balances.filter(
    (b) => b.asset_type !== 'native',
  ).length;
  // Signers array includes the master key; exclude it from subentry count.
  const signers = Math.max(0, (account.signers?.length ?? 1) - 1);
  const offers = account.subentry_count ?? 0;
  const dataEntries = 0;
  // Horizon exposes subentry_count directly; prefer it when available.
  const total =
    typeof account.subentry_count === 'number'
      ? account.subentry_count
      : trustlines + signers + offers + dataEntries;
  return { trustlines, signers, offers, dataEntries, total };
}

function extractUsdcBalance(account: Horizon.AccountResponse): number {
  const usdc = account.balances.find(
    (b) =>
      b.asset_type !== 'native' &&
      'asset_code' in b &&
      b.asset_code === USDC_ASSET_CODE,
  );
  return usdc && 'balance' in usdc ? parseFloat(usdc.balance) : 0;
}

function extractNativeBalance(account: Horizon.AccountResponse): number {
  const native = account.balances.find((b) => b.asset_type === 'native');
  return native ? parseFloat(native.balance) : 0;
}

export class StellarReserveMonitorService {
  private readonly server: Horizon.Server;
  private readonly config: Required<
    Omit<ReserveMonitorConfig, 'accounts' | 'alert' | 'networkPassphrase'>
  > & { accounts: string[]; alert?: ReserveMonitorConfig['alert'] };
  private timer: NodeJS.Timeout | null = null;

  constructor(config: ReserveMonitorConfig) {
    this.server = new Horizon.Server(config.horizonUrl);
    this.config = {
      horizonUrl: config.horizonUrl,
      baseReserveXlm: config.baseReserveXlm ?? DEFAULT_BASE_RESERVE_XLM,
      bufferXlm: config.bufferXlm ?? DEFAULT_BUFFER_XLM,
      warningMultiplier:
        config.warningMultiplier ?? DEFAULT_WARNING_MULTIPLIER,
      minUsdcBalance: config.minUsdcBalance ?? DEFAULT_MIN_USDC,
      accounts: config.accounts,
      alert: config.alert,
    };
  }

  async checkAccount(accountId: string): Promise<AccountReserveState> {
    const account = await this.server.loadAccount(accountId);
    const counts = countSubentries(account);
    const xlmBalance = extractNativeBalance(account);
    const usdcBalance = extractUsdcBalance(account);
    const requiredReserveXlm = calculateRequiredReserve(
      counts.total,
      this.config.baseReserveXlm,
      this.config.bufferXlm,
    );
    const availableXlm = xlmBalance - requiredReserveXlm;

    let status: AccountReserveState['status'] = 'ok';
    if (availableXlm < 0 || usdcBalance < this.config.minUsdcBalance) {
      status = 'critical';
    } else if (
      availableXlm <
      requiredReserveXlm * (this.config.warningMultiplier - 1)
    ) {
      status = 'warning';
    }

    return {
      accountId,
      xlmBalance,
      usdcBalance,
      subentries: counts.total,
      trustlines: counts.trustlines,
      signers: counts.signers,
      offers: counts.offers,
      dataEntries: counts.dataEntries,
      baseReserveXlm: this.config.baseReserveXlm,
      bufferXlm: this.config.bufferXlm,
      requiredReserveXlm,
      availableXlm,
      status,
    };
  }

  async runCheck(): Promise<ReserveCheckResult> {
    const checkedAt = new Date().toISOString();
    const accounts: AccountReserveState[] = [];
    const alerts: string[] = [];

    for (const accountId of this.config.accounts) {
      try {
        const state = await this.checkAccount(accountId);
        accounts.push(state);

        if (state.status === 'critical') {
          const msg =
            `[StellarReserveMonitor] CRITICAL: account ${accountId} ` +
            `XLM=${state.xlmBalance.toFixed(7)} required=${state.requiredReserveXlm.toFixed(7)} ` +
            `USDC=${state.usdcBalance.toFixed(7)}`;
          alerts.push(msg);
          await this.emitAlert(msg, { ...state });
        } else if (state.status === 'warning') {
          const msg =
            `[StellarReserveMonitor] WARNING: account ${accountId} ` +
            `available XLM=${state.availableXlm.toFixed(7)} approaching reserve ` +
            `required=${state.requiredReserveXlm.toFixed(7)}`;
          alerts.push(msg);
          await this.emitAlert(msg, { ...state });
        }
      } catch (err) {
        const msg = `[StellarReserveMonitor] Failed to check account ${accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`;
        alerts.push(msg);
        logger.error(msg);
      }
    }

    return { checkedAt, accounts, alerts };
  }

  private async emitAlert(
    message: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    logger.warn(message);
    if (this.config.alert) {
      try {
        await this.config.alert(message, context);
      } catch (err) {
        logger.error(
          `[StellarReserveMonitor] Alert sink failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Start the scheduled monitor. Runs immediately then on the given interval.
   */
  start(intervalMs: number = 5 * 60 * 1000): void {
    if (this.timer) return;
    void this.runCheck().catch((err) =>
      logger.error(
        `[StellarReserveMonitor] Scheduled check failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    this.timer = setInterval(() => {
      void this.runCheck().catch((err) =>
        logger.error(
          `[StellarReserveMonitor] Scheduled check failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }, intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
