import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
  Networks,
} from "@stellar/stellar-sdk";
import { PrismaClient } from "../generated/client/client";
import { Decimal } from "@prisma/client/runtime/library";
import { HDWalletService } from "./HDWalletService";
import { logSweepTrigger, updateSweepCompletion } from "./audit.service";

const prisma = new PrismaClient();

export interface SweepOptions {
  /** Max number of payments to sweep per run (defensive). */
  limit?: number;
  /** Who triggered the sweep (for audit logs). */
  adminId?: string;
  /** If true, don't submit transactions; just report what would be swept. */
  dryRun?: boolean;
}

export interface SweepResult {
  sweepId: string;
  startedAt: Date;
  completedAt: Date;
  addressesSwept: number;
  totalAmount: string;
  masterVaultPublicKey: string;
  txHashes: string[];
  skipped: Array<{ paymentId: string; reason: string }>;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

/**
 * SweepService
 *
 * Moves USDC from per-payment derived addresses (custody addresses) into a
 * central master vault address so settlement batching can later operate on
 * `swept=true` payments.
 */
export class SweepService {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private usdcAsset: Asset;
  private vaultKeypair: Keypair;
  private hdWalletService: HDWalletService;

  constructor() {
    const horizonUrl = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

    const issuer =
      process.env.USDC_ISSUER_PUBLIC_KEY ||
      "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
    this.usdcAsset = new Asset("USDC", issuer);

    // Central vault is the collection wallet.
    // Requirements mention "master vault"; we use MASTER_VAULT_SECRET_KEY.
    const vaultSecret = requiredEnv("MASTER_VAULT_SECRET_KEY");
    this.vaultKeypair = Keypair.fromSecret(vaultSecret);

    this.hdWalletService = new HDWalletService();
  }

  /** Identify eligible payments: confirmed/overpaid/paid, not swept, has derived address. */
  private async getUnsweptPaidPayments(limit: number) {
    return prisma.payment.findMany({
      where: {
        swept: false,
        stellar_address: { not: null },
        status: { in: ["confirmed", "overpaid", "paid"] },
      },
      orderBy: { confirmed_at: "asc" },
      take: limit,
    });
  }

  private async submitUsdcSweepTx(params: {
    sourceSecret: string;
    destination: string;
    amount: string;
  }): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(params.sourceSecret);
    const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: params.destination,
          asset: this.usdcAsset,
          amount: params.amount,
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(sourceKeypair);

    const res = await this.server.submitTransaction(tx);
    return res.hash;
  }

  /**
   * Runs a sweep.
   *
   * For safety and simplicity, this submits **one tx per payment address**.
   */
  public async sweepPaidPayments(options: SweepOptions = {}): Promise<SweepResult> {
    const startedAt = new Date();
    const sweepId = `sweep_${startedAt.getTime()}`;

    const limit =
      Number.isFinite(options.limit) && (options.limit as number) > 0
        ? (options.limit as number)
        : parseInt(process.env.SWEEP_BATCH_LIMIT || "200", 10);

    const adminId = options.adminId || "system";
    const dryRun = options.dryRun === true;

    const auditLog = await logSweepTrigger({
      adminId,
      sweepType: dryRun ? "dry_run" : "scheduled",
      reason: "Sweep paid but unswept payments into master vault",
    });

    const payments = await this.getUnsweptPaidPayments(limit);

    const txHashes: string[] = [];
    const skipped: Array<{ paymentId: string; reason: string }> = [];
    let total = 0;
    let addressesSwept = 0;

    for (const p of payments) {
      try {
        const expected = Number(p.amount as any as Decimal);
        if (!Number.isFinite(expected) || expected <= 0) {
          skipped.push({ paymentId: p.id, reason: "Invalid amount" });
          continue;
        }

        // Recreate source secret for the derived payment address.
        const kp = await this.hdWalletService.regenerateKeypair(p.merchantId, p.id);

        // Ensure address matches DB (defense in depth)
        if (p.stellar_address && kp.publicKey !== p.stellar_address) {
          skipped.push({ paymentId: p.id, reason: "Derived address mismatch" });
          continue;
        }

        if (dryRun) {
          addressesSwept += 1;
          total += expected;
          continue;
        }

        // Sweep the expected amount.
        const amountStr = expected.toFixed(7);
        const hash = await this.submitUsdcSweepTx({
          sourceSecret: kp.secretKey,
          destination: this.vaultKeypair.publicKey(),
          amount: amountStr,
        });

        await prisma.payment.update({
          where: { id: p.id },
          data: {
            swept: true,
            swept_at: new Date(),
            sweep_tx_hash: hash,
          },
        });

        txHashes.push(hash);
        addressesSwept += 1;
        total += expected;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        skipped.push({ paymentId: p.id, reason: msg });
      }
    }

    const completedAt = new Date();

    if (auditLog) {
      await updateSweepCompletion({
        auditLogId: auditLog.id,
        status: skipped.length > 0 && addressesSwept === 0 ? "failed" : "completed",
        statistics: {
          addresses_swept: addressesSwept,
          total_amount: total.toFixed(7),
          transaction_hash: txHashes[0],
        },
        failureReason:
          skipped.length > 0 && addressesSwept === 0
            ? skipped
                .map((s) => `${s.paymentId}:${s.reason}`)
                .slice(0, 5)
                .join(" | ")
            : undefined,
      });
    }

    return {
      sweepId,
      startedAt,
      completedAt,
      addressesSwept,
      totalAmount: total.toFixed(7),
      masterVaultPublicKey: this.vaultKeypair.publicKey(),
      txHashes,
      skipped,
    };
  }
}

export const sweepService = new SweepService();
