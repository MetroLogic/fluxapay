import { Horizon, Keypair } from "@stellar/stellar-sdk";
import { DepositAddressService } from "./depositAddress.service";

export interface FunderBalanceStatus {
  publicKey: string;
  xlmBalance: number;
  thresholdXlm: number;
  ok: boolean;
}

export interface PoolDepthStatus {
  availableCount: number;
  allocatedCount: number;
  totalCount: number;
  utilizationPct: number;
  ok: boolean;
}

export interface FunderMonitorStatus {
  funder: FunderBalanceStatus;
  pool: PoolDepthStatus;
  ok: boolean;
}

/**
 * funderMonitor.service.ts
 *
 * Technical-debt utility for monitoring the funder wallet balance used to create
 * derived payment accounts and monitoring deposit address pool depth.
 */
export class FunderMonitorService {
  private server: Horizon.Server;
  private funderKeypair: Keypair;

  constructor() {
    const horizonUrl = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
    this.server = new Horizon.Server(horizonUrl);

    const funderSecret = process.env.FUNDER_SECRET_KEY;
    if (!funderSecret) {
      throw new Error("FUNDER_SECRET_KEY is required");
    }
    this.funderKeypair = Keypair.fromSecret(funderSecret);
  }

  public async getBalanceStatus(): Promise<FunderBalanceStatus> {
    const thresholdXlm = parseFloat(process.env.FUNDER_LOW_BALANCE_THRESHOLD_XLM || "20");

    const account = await this.server.loadAccount(this.funderKeypair.publicKey());
    const nativeBal = account.balances.find((b: any) => b.asset_type === "native");
    const xlmBalance = nativeBal ? parseFloat(nativeBal.balance) : 0;

    return {
      publicKey: this.funderKeypair.publicKey(),
      xlmBalance,
      thresholdXlm,
      ok: xlmBalance >= thresholdXlm,
    };
  }

  public async getPoolStatus(): Promise<PoolDepthStatus> {
    const stats = await DepositAddressService.getPoolStats();
    return {
      availableCount: stats.availableCount,
      allocatedCount: stats.allocatedCount,
      totalCount: stats.totalCount,
      utilizationPct: stats.utilizationPct,
      ok: stats.utilizationPct < 0.8,
    };
  }

  public async getCompleteStatus(): Promise<FunderMonitorStatus> {
    const [funder, pool] = await Promise.all([
      this.getBalanceStatus(),
      this.getPoolStatus(),
    ]);

    return {
      funder,
      pool,
      ok: funder.ok && pool.ok,
    };
  }
}

let _funderMonitorService: FunderMonitorService | undefined;
try {
  _funderMonitorService = new FunderMonitorService();
} catch (err) {
  console.warn(
    "FunderMonitorService failed to initialize (invalid or missing FUNDER_SECRET_KEY):",
    err instanceof Error ? err.message : err,
  );
}

export const funderMonitorService = _funderMonitorService as FunderMonitorService;
