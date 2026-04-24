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
import { getLogger, getMetricsCollector } from "../utils/logger";

const prisma = new PrismaClient();

export interface SweepOptions {
  /** Max number of payments to sweep per run (defensive). */
  limit?: number;
  /** Who triggered the sweep (for audit logs). */
  adminId?: string;
  /** If true, don't submit transactions; just report what would be swept. */
  dryRun?: boolean;
  /**
   * If true, after sweeping USDC this will attempt an `accountMerge` back into the funder
   * to recover the XLM reserve.
   */
  enableAccountMerge?: boolean;
}

export interface SweepDecision {
  paymentId: string;
  action: "sweep" | "skip";
  /** Populated for action=sweep: USDC amount that would be / was moved. */
  amount?: string;
  /** Populated for action=skip: human-readable reason the payment was skipped. */
  reason?: string;
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
  /** Per-payment decisions; only populated when dryRun=true. */
  decisions?: SweepDecision[];
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
  private readonly logger = getLogger("SweepService");
  private readonly metrics = getMetricsCollector();
  private readonly baseFee: number;
  private readonly maxFee: number;
  private readonly feeBumpMultiplier: number;
  private readonly maxRetries: number;

  constructor() {
    const horizonUrl =
      process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
    this.baseFee = Number(process.env.STELLAR_BASE_FEE || "100");
    this.maxFee = Number(process.env.STELLAR_MAX_FEE || "2000");
    this.feeBumpMultiplier = Number(
      process.env.STELLAR_FEE_BUMP_MULTIPLIER || "2",
    );
    this.maxRetries = Number(process.env.STELLAR_TX_MAX_RETRIES || "3");

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
    /** Optional destination to merge remaining XLM into after payment succeeds. */
    mergeDestination?: string;
  }): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const sourceKeypair = Keypair.fromSecret(params.sourceSecret);
        const sourceAccount = await this.server.loadAccount(
          sourceKeypair.publicKey(),
        );

        const builder = new TransactionBuilder(sourceAccount, {
          fee: this.calculateFeeForAttempt(attempt),
          networkPassphrase: this.networkPassphrase,
        }).addOperation(
          Operation.payment({
            destination: params.destination,
            asset: this.usdcAsset,
            amount: params.amount,
          }),
        );

        if (params.mergeDestination) {
          builder.addOperation(
            Operation.accountMerge({
              destination: params.mergeDestination,
            }),
          );
        }

        const tx = builder.setTimeout(30).build();

        tx.sign(sourceKeypair);

        const res = await this.server.submitTransaction(tx);
        return res.hash;
      } catch (error) {
        lastError = error;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.logger.warn("Sweep transaction submission failed", {
          attempt,
          maxRetries: this.maxRetries,
          fee: this.calculateFeeForAttempt(attempt),
          errorMessage,
        });

        this.metrics.increment("stellar.sweep.submit.failure", {
          attempt: attempt.toString(),
          fee: this.calculateFeeForAttempt(attempt),
        });

        if (attempt >= this.maxRetries) {
          this.logger.error("ALERT: repeated Stellar sweep transaction failures", {
            attempts: attempt,
            feeBudget: {
              baseFee: this.baseFee,
              maxFee: this.maxFee,
              multiplier: this.feeBumpMultiplier,
            },
          });
          this.metrics.increment("stellar.sweep.repeated_failures");
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to submit sweep transaction");
  }

  private calculateFeeForAttempt(attempt: number): string {
    const bump = Math.pow(this.feeBumpMultiplier, Math.max(0, attempt - 1));
    const candidateFee = Math.floor(this.baseFee * bump);
    return Math.min(candidateFee, this.maxFee).toString();
  }

  /**
   * Runs a sweep.
   *
   * For safety and simplicity, this submits **one tx per payment address**.
   */
  public async sweepPaidPayments(
    options: SweepOptions = {},
  ): Promise<SweepResult> {
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
    const decisions: SweepDecision[] = [];
    let total = 0;
    let addressesSwept = 0;

    const enableAccountMerge =
      options.enableAccountMerge ??
      process.env.SWEEP_ENABLE_ACCOUNT_MERGE === "true";

    const mergeDestination = enableAccountMerge
      ? process.env.FUNDER_PUBLIC_KEY
      : undefined;

    if (enableAccountMerge && !mergeDestination) {
      console.warn(
        "[Sweep] SWEEP_ENABLE_ACCOUNT_MERGE=true but FUNDER_PUBLIC_KEY is not set. Account merge will be skipped.",
      );
    }

    for (const p of payments) {
      try {
        const expected = Number(p.amount as any as Decimal);
        if (!Number.isFinite(expected) || expected <= 0) {
          const skipEntry = { paymentId: p.id, reason: "Invalid amount" };
          skipped.push(skipEntry);
          if (dryRun) decisions.push({ ...skipEntry, action: "skip" });
          continue;
        }

        // Recreate source secret for the derived payment address.
        // Priority:
        //   1. derivation_path (stored at payment creation — fastest, no extra DB query)
        //   2. encrypted_key_data (decrypt indices, then derive)
        //   3. Legacy fallback: DB index lookup via merchantId/paymentId
        let kp: { publicKey: string; secretKey: string };

        if (p.derivation_path) {
          // Fast path: re-derive directly from the stored BIP44 path
          kp = await this.hdWalletService.regenerateKeypairFromPath(
            p.derivation_path,
          );
        } else if (p.encrypted_key_data) {
          // Decrypt indices and derive
          const { merchantIndex, paymentIndex } =
            await this.hdWalletService.decryptKeyData(p.encrypted_key_data);
          kp = await this.hdWalletService.regenerateKeypair(
            merchantIndex,
            paymentIndex,
          );
        } else {
          // Legacy: look up indices from DB (payments created before this feature)
          kp = await this.hdWalletService.regenerateKeypair(p.merchantId, p.id);
        }

        // Ensure address matches DB (defense in depth)
        if (p.stellar_address && kp.publicKey !== p.stellar_address) {
          const skipEntry = { paymentId: p.id, reason: "Derived address mismatch" };
          skipped.push(skipEntry);
          if (dryRun) decisions.push({ ...skipEntry, action: "skip" });
          continue;
        }

        // Load current on-chain account state and use actual USDC balance.
        const account = await this.server.loadAccount(kp.publicKey);
        const usdcBalanceEntry = account.balances.find((b) =>
          b.asset_type === "credit_alphanum4" &&
          b.asset_code === "USDC" &&
          b.asset_issuer === this.usdcAsset.issuer,
        );

        const accountUsdcAmount = Number(usdcBalanceEntry?.balance ?? "0");
        if (!Number.isFinite(accountUsdcAmount) || accountUsdcAmount <= 0) {
          const skipEntry = { paymentId: p.id, reason: "No USDC balance to sweep" };
          skipped.push(skipEntry);
          if (dryRun) decisions.push({ ...skipEntry, action: "skip" });
          continue;
        }

        if (dryRun) {
          decisions.push({ paymentId: p.id, action: "sweep", amount: accountUsdcAmount.toFixed(7) });
          addressesSwept += 1;
          total += accountUsdcAmount;
          continue;
        }

        const amountStr = accountUsdcAmount.toFixed(7);
        const hash = await this.submitUsdcSweepTx({
          sourceSecret: kp.secretKey,
          destination: this.vaultKeypair.publicKey(),
          amount: amountStr,
          mergeDestination,
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
        total += accountUsdcAmount;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        skipped.push({ paymentId: p.id, reason: msg });
        if (dryRun) decisions.push({ paymentId: p.id, action: "skip", reason: msg });
      }
    }

    const completedAt = new Date();

    if (auditLog) {
      await updateSweepCompletion({
        auditLogId: auditLog.id,
        status:
          skipped.length > 0 && addressesSwept === 0 ? "failed" : "completed",
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
      ...(dryRun && { decisions }),
    };
  }
}

let _sweepService: SweepService | undefined;
try {
  _sweepService = new SweepService();
} catch (err) {
  console.warn(
    "SweepService failed to initialize (missing Stellar env vars?):",
    err instanceof Error ? err.message : err
  );
}
export const sweepService = _sweepService as SweepService;
