import { Horizon, Keypair } from "@stellar/stellar-sdk";

export interface FunderBalanceStatus {
  publicKey: string;
  xlmBalance: number;
  thresholdXlm: number;
  ok: boolean;
}

/**
 * funderMonitor.service.ts
 *
 * Technical-debt utility for monitoring the funder wallet balance used to create
 * derived payment accounts.
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
}

export const funderMonitorService = new FunderMonitorService();
