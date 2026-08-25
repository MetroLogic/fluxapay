import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
  Networks,
} from "@stellar/stellar-sdk";
import { PrismaClient } from "../generated/client/client";
import { prisma } from "../config/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { HDWalletService } from "./HDWalletService";
import {
  logSweepFailure,
  logSweepTrigger,
  updateSweepCompletion,
} from "./audit.service";
import { getLogger, getMetricsCollector } from "../utils/logger";
import { sweepQueue } from "./sweepQueue.service";
import {
  getMaxSweepRetryAttempts,
  getSweepMinBalanceUsdc,
} from "../config/sweep.config";


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
 * SweepService with concurrency control and backpressure
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
    this.maxFee = Number(
      process.env.SWEEP_MAX_FEE_STROOPS ||
      process.env.STELLAR_MAX_FEE ||
      "2000"
    );
    this.feeBumpMultiplier = Number(
      process.env.STELLAR_FEE_BUMP_MULTIPLIER || "2",
    );
    this.maxRetries = Number(process.env.STELLAR_TX_MAX_RETRIES || "3");

    const issuer =
      process.env.USDC_ISSUER_PUBLIC_KEY ||
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    this.usdcAsset = new Asset("USDC", issuer);

    const vaultSecret = requiredEnv("MASTER_VAULT_SECRET_KEY");
    this.vaultKeypair = Keypair.fromSecret(vaultSecret);

    this.hdWalletService = new HDWalletService();
  }

  private getMaxFee(): number {
    return Number(
      process.env.SWEEP_MAX_FEE_STROOPS ||
      process.env.STELLAR_MAX_FEE ||
      this.maxFee ||
      "2000"
    );
  }

  /**
   * Identify eligible payments: confirmed/overpaid/paid, not swept, has derived
   * address, and not already flagged for manual review after exhausting retries.
   */
  private async getUnsweptPaidPayments(limit: number) {
    return prisma.payment.findMany({
      where: {
        swept: false,
        stellar_address: { not: null },
        status: { in: ["confirmed", "overpaid", "paid"] },
        sweep_needs_manual_review: false,
      },
      orderBy: { confirmed_at: "asc" },
      take: limit,
    });
  }

  private async submitUsdcSweepTx(params: {
    sourceSecret: string;
    destination: string;
    amount: string;
    mergeDestination?: string;
  }): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      let p90Fee = this.baseFee;
      try {
        if (typeof this.server.feeStats === "function") {
          const feeStats = await this.server.feeStats();
          const p90 = feeStats?.fee_charged?.p90;
          if (p90 !== undefined && p90 !== null) {
            const parsedP90 = parseInt(String(p90), 10);
            if (!isNaN(parsedP90) && parsedP90 > 0) {
              p90Fee = Math.max(this.baseFee, parsedP90);
            }
          }
        }
      } catch (feeErr) {
        this.logger.warn("Failed to fetch fee stats from Horizon, falling back to base fee", {
          error: feeErr instanceof Error ? feeErr.message : String(feeErr),
        });
      }

      const attemptFee = this.calculateFeeForAttempt(attempt, p90Fee);

      try {
        const sourceKeypair = Keypair.fromSecret(params.sourceSecret);
        const sourceAccount = await this.server.loadAccount(
          sourceKeypair.publicKey(),
        );

        const builder = new TransactionBuilder(sourceAccount, {
          fee: attemptFee,
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
            Operation.changeTrust({
              asset: this.usdcAsset,
              limit: "0",
            }),
          );

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
          fee: attemptFee,
          errorMessage,
        });

        this.metrics.increment("stellar.sweep.submit.failure", {
          attempt: attempt.toString(),
          fee: attemptFee,
        });

        if (attempt >= this.maxRetries) {
          this.logger.error(
            "ALERT: repeated Stellar sweep transaction failures",
            {
              attempts: attempt,
              feeBudget: {
                baseFee: this.baseFee,
                maxFee: this.getMaxFee(),
                multiplier: this.feeBumpMultiplier,
              },
            },
          );
          this.metrics.increment("stellar.sweep.repeated_failures");
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to submit sweep transaction");
  }

  public calculateFeeForAttempt(attempt: number, p90BaseFee?: number): string {
    const base = Math.max(this.baseFee, p90BaseFee ?? this.baseFee);
    const bump = Math.pow(this.feeBumpMultiplier, Math.max(0, attempt - 1));
    const candidateFee = Math.floor(base * bump);
    const maxFee = this.getMaxFee();

    if (candidateFee >= maxFee) {
      this.metrics.increment("stellar.sweep.capped_fee_reached", {
        attempt: attempt.toString(),
        candidateFee: candidateFee.toString(),
        maxFee: maxFee.toString(),
      });
      return maxFee.toString();
    }

    return candidateFee.toString();
  }

  /**
   * Runs a sweep with concurrency control and backpressure.
   *
   * For safety and simplicity, this submits **one tx per payment address**.
   * Uses a queue with concurrency limits to prevent overwhelming the network.
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

    // Check backpressure before starting
    if (!dryRun && !sweepQueue.canAcceptTask()) {
      const backpressureLevel = sweepQueue.getBackpressureLevel();
      this.logger.warn("Sweep queue at capacity, applying backpressure", {
        backpressureLevel,
        queueStats: sweepQueue.getStats(),
      });
      this.metrics.increment("sweep.backpressure_applied");

      throw new Error(
        `Sweep queue is at ${(backpressureLevel * 100).toFixed(1)}% capacity. Please retry later.`,
      );
    }

    const auditLog = await logSweepTrigger({
      adminId,
      sweepType: dryRun ? "dry_run" : "scheduled",
      reason: "Sweep paid but unswept payments into master vault",
    });

    const payments = await this.getUnsweptPaidPayments(limit);
    const maxSweepRetryAttempts = getMaxSweepRetryAttempts();

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

    // Process payments with concurrency control
    const sweepPromises: Promise<void>[] = [];

    for (const p of payments) {
      const sweepTask = async () => {
        try {
          const expected = Number(p.amount as any as Decimal);
          if (!Number.isFinite(expected) || expected <= 0) {
            const skipEntry = { paymentId: p.id, reason: "Invalid amount" };
            skipped.push(skipEntry);
            if (dryRun) decisions.push({ ...skipEntry, action: "skip" });
            return;
          }

          let seedVersion = 1;
          if (p.stellar_address) {
            const depositAddr = await prisma.depositAddress.findFirst({
              where: { public_key: p.stellar_address },
              select: { seedVersion: true },
            });
            if (depositAddr?.seedVersion) {
              seedVersion = depositAddr.seedVersion;
            }
          }

          let kp: { publicKey: string; secretKey: string };

          if (p.derivation_path) {
            kp = await this.hdWalletService.regenerateKeypairFromPath(
              p.derivation_path,
              seedVersion,
            );
          } else if (p.encrypted_key_data) {
            const { merchantIndex, paymentIndex } =
              await this.hdWalletService.decryptKeyData(p.encrypted_key_data);
            kp = await this.hdWalletService.regenerateKeypair(
              merchantIndex,
              paymentIndex,
              seedVersion,
            );
          } else {
            kp = await this.hdWalletService.regenerateKeypair(
              p.merchantId,
              p.id,
              seedVersion,
            );
          }

          if (p.stellar_address && kp.publicKey !== p.stellar_address) {
            const skipEntry = {
              paymentId: p.id,
              reason: "Derived address mismatch",
            };
            skipped.push(skipEntry);
            if (dryRun) decisions.push({ ...skipEntry, action: "skip" });
            return;
          }

          const account = await this.server.loadAccount(kp.publicKey);
          const usdcBalanceEntry = account.balances.find(
            (b) =>
              b.asset_type === "credit_alphanum4" &&
              b.asset_code === "USDC" &&
              b.asset_issuer === this.usdcAsset.issuer,
          );

          const accountUsdcAmount = Number(usdcBalanceEntry?.balance ?? "0");
          const minBalanceUsdc = getSweepMinBalanceUsdc();
          if (!Number.isFinite(accountUsdcAmount) || accountUsdcAmount <= 0) {
            const skipEntry = {
              paymentId: p.id,
              reason: "No USDC balance to sweep",
            };
            skipped.push(skipEntry);
            if (dryRun) decisions.push({ ...skipEntry, action: "skip" });
            return;
          }

          if (accountUsdcAmount < minBalanceUsdc) {
            const skipEntry = {
              paymentId: p.id,
              reason: `Balance ${accountUsdcAmount.toFixed(7)} USDC below minimum threshold ${minBalanceUsdc}`,
            };
            skipped.push(skipEntry);
            if (dryRun) decisions.push({ ...skipEntry, action: "skip" });
            return;
          }

          if (dryRun) {
            decisions.push({
              paymentId: p.id,
              action: "sweep",
              amount: accountUsdcAmount.toFixed(7),
            });
            addressesSwept += 1;
            total += accountUsdcAmount;
            return;
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

          if (dryRun) {
            decisions.push({ paymentId: p.id, action: "skip", reason: msg });
            return;
          }

          // Per-payment error isolation (#824): a failed sweep must never
          // abort the batch. Persisting the retry count / manual-review flag
          // and writing the audit log are themselves guarded so that a
          // failure in this bookkeeping can't become a new way to do that.
          const nextRetryCount = (p.sweep_retry_count ?? 0) + 1;
          const needsManualReview = nextRetryCount >= maxSweepRetryAttempts;

          try {
            await prisma.payment.update({
              where: { id: p.id },
              data: {
                sweep_retry_count: nextRetryCount,
                sweep_last_error: msg.slice(0, 500),
                sweep_failed_at: new Date(),
                sweep_needs_manual_review: needsManualReview,
              },
            });
          } catch (updateErr: unknown) {
            this.logger.error("Failed to persist sweep retry tracking", {
              paymentId: p.id,
              error:
                updateErr instanceof Error
                  ? updateErr.message
                  : String(updateErr),
            });
          }

          try {
            await logSweepFailure({
              paymentId: p.id,
              error: msg,
              retryCount: nextRetryCount,
              flaggedForManualReview: needsManualReview,
            });
          } catch (auditErr: unknown) {
            this.logger.error("Failed to write sweep failure audit log", {
              paymentId: p.id,
              error:
                auditErr instanceof Error
                  ? auditErr.message
                  : String(auditErr),
            });
          }
        }
      };

      if (dryRun) {
        // In dry-run mode, execute immediately without queueing
        sweepPromises.push(sweepTask());
      } else {
        // In production mode, use the queue for concurrency control
        sweepPromises.push(sweepQueue.enqueue(`${sweepId}:${p.id}`, sweepTask));
      }
    }

    // Wait for all sweep tasks to complete
    await Promise.allSettled(sweepPromises);

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

let _sweepService: SweepService;
try {
  _sweepService = new SweepService();
} catch (err) {
  console.error("SweepService failed to initialize", err);
  throw err;
}
export const sweepService = _sweepService;
