/**
 * horizonPoller.service.ts
 *
 * Issue #771: Consolidate Horizon polling into a single shared service.
 *
 * Previously, paymentMonitor.service.ts and paymentOracle.service.ts each
 * polled Horizon independently, causing duplicate RPC calls on every tick.
 * This service is the single source of Horizon polling. It emits
 * "payment:detected" events that downstream consumers (oracle, monitor)
 * subscribe to instead of polling directly.
 *
 * Consumers:
 *   - paymentOracle.service.ts  — subscribes to process and verify payments
 *   - paymentMonitor.service.ts — deprecated no-op, retained for import compat
 *
 * Metrics:
 *   - horizon_poller.events_emitted   (counter)
 *   - horizon_poller.events_processed (counter, incremented by consumers)
 *   - horizon_poller.tick_duration_ms (histogram)
 *   - horizon_poller.poll_errors      (counter)
 */

import { EventEmitter } from "events";
import { Horizon, Asset } from "@stellar/stellar-sdk";
import { getLogger, getMetricsCollector } from "../utils/logger";

const logger = getLogger("HorizonPollerService");
const metrics = getMetricsCollector();

// ─── Configuration ────────────────────────────────────────────────────────────

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const USDC_ISSUER =
  process.env.USDC_ISSUER_PUBLIC_KEY ||
  "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
const POLLING_INTERVAL_MS = parseInt(
  process.env.ORACLE_POLLING_INTERVAL_MS || "30000",
  10,
);

// ─── Event Types ──────────────────────────────────────────────────────────────

export const HORIZON_POLLER_EVENTS = {
  PAYMENT_DETECTED: "payment:detected",
  TICK_COMPLETED: "poller:tick:completed",
  TICK_FAILED: "poller:tick:failed",
} as const;

export interface HorizonPaymentDetectedEvent {
  /** Stellar account address that received the payment */
  destinationAddress: string;
  transactionHash: string;
  amount: string;
  assetCode: string;
  assetIssuer: string;
  payer: string;
  pagingToken: string;
  detectedAt: Date;
}

// ─── Poller ───────────────────────────────────────────────────────────────────

class HorizonPollerService extends EventEmitter {
  private server: Horizon.Server;
  private usdcAsset: Asset;
  private isRunning = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private eventsEmitted = 0;
  private eventsProcessed = 0;

  /** Addresses currently being watched. Populated by consumers calling watchAddress(). */
  private watchedAddresses = new Set<string>();

  constructor() {
    super();
    this.server = new Horizon.Server(HORIZON_URL);
    this.usdcAsset = new Asset("USDC", USDC_ISSUER);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a Stellar address to be polled each tick.
   * Called by paymentOracle when it begins monitoring a payment.
   */
  public watchAddress(address: string): void {
    this.watchedAddresses.add(address);
    logger.debug("HorizonPoller: watching address", { address });
  }

  /** Remove an address from the watch list (e.g. payment confirmed/expired). */
  public unwatchAddress(address: string): void {
    this.watchedAddresses.delete(address);
  }

  /** Acknowledge that a consumer processed an emitted event (for metrics). */
  public acknowledgeEvent(): void {
    this.eventsProcessed += 1;
    metrics.increment("horizon_poller.events_processed");
  }

  public start(): void {
    if (this.isRunning) {
      logger.warn("HorizonPoller is already running");
      return;
    }

    logger.info("HorizonPoller starting", {
      horizonUrl: HORIZON_URL,
      pollingIntervalMs: POLLING_INTERVAL_MS,
    });

    this.isRunning = true;

    // First tick immediately
    this.tick().catch((err) =>
      logger.error("HorizonPoller: initial tick failed", {
        error: err?.message,
      }),
    );

    this.intervalHandle = setInterval(() => {
      if (!this.isRunning) return;
      this.tick().catch((err) =>
        logger.error("HorizonPoller: scheduled tick failed", {
          error: err?.message,
        }),
      );
    }, POLLING_INTERVAL_MS);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info("HorizonPoller stopped");
  }

  public getStats() {
    return {
      isRunning: this.isRunning,
      watchedAddresses: this.watchedAddresses.size,
      eventsEmitted: this.eventsEmitted,
      eventsProcessed: this.eventsProcessed,
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /**
   * Single poll tick — checks every watched address for new USDC payments
   * and emits a "payment:detected" event for each one found.
   * Horizon is called exactly once per address per tick.
   */
  private async tick(): Promise<void> {
    const start = Date.now();
    const addresses = Array.from(this.watchedAddresses);

    if (addresses.length === 0) {
      return;
    }

    let detected = 0;

    await Promise.allSettled(
      addresses.map(async (address) => {
        try {
          const records = await this.server
            .payments()
            .forAccount(address)
            .order("desc")
            .limit(10)
            .call();

          for (const record of records.records) {
            if (record.type !== "payment") continue;
            const p = record as any;

            if (
              p.asset_code === "USDC" &&
              p.asset_issuer === this.usdcAsset.issuer &&
              p.to === address
            ) {
              const event: HorizonPaymentDetectedEvent = {
                destinationAddress: address,
                transactionHash: p.transaction_hash,
                amount: p.amount,
                assetCode: p.asset_code,
                assetIssuer: p.asset_issuer,
                payer: p.from,
                pagingToken: record.paging_token,
                detectedAt: new Date(),
              };

              this.emit(HORIZON_POLLER_EVENTS.PAYMENT_DETECTED, event);
              this.eventsEmitted += 1;
              metrics.increment("horizon_poller.events_emitted");
              detected += 1;
            }
          }
        } catch (err: any) {
          logger.warn("HorizonPoller: failed to poll address", {
            address,
            error: err?.message,
          });
          metrics.increment("horizon_poller.poll_errors");
        }
      }),
    );

    const duration = Date.now() - start;
    metrics.histogram("horizon_poller.tick_duration_ms", duration);

    this.emit(HORIZON_POLLER_EVENTS.TICK_COMPLETED, {
      addressesPolled: addresses.length,
      eventsEmitted: detected,
      durationMs: duration,
    });

    logger.debug("HorizonPoller: tick completed", {
      addressesPolled: addresses.length,
      eventsEmitted: detected,
      durationMs: duration,
    });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const horizonPoller = new HorizonPollerService();
