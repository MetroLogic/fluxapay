/**
 * StellarPrepareQueue – Redis-backed persistent retry queue for Stellar account
 * preparation (fund + trustline) jobs that fail during payment creation.
 *
 * When stellarService.prepareAccount() fails, instead of silently dropping the
 * failure, the job is pushed onto this queue so it is retried on the next server
 * start (or immediately, if the server is still running) – closes #1046.
 *
 * Usage:
 *   stellarPrepareQueue.enqueue(merchantId, paymentId);
 */

import { redisClient } from '../middleware/redisIdempotency.middleware';
import { StellarService } from './StellarService';

export interface StellarPrepareJob {
  merchantId: string;
  paymentId: string;
  attempts: number;
  maxAttempts: number;
}

const QUEUE_KEY = 'stellar:prepare:queue';
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000;

export class StellarPrepareQueueService {
  private draining = false;

  /**
   * Push a failed account-preparation job onto the persistent Redis queue and
   * begin draining if not already running.
   */
  enqueue(merchantId: string, paymentId: string, maxAttempts = MAX_ATTEMPTS): void {
    const job: StellarPrepareJob = { merchantId, paymentId, attempts: 0, maxAttempts };
    redisClient.rpush(QUEUE_KEY, JSON.stringify(job)).catch((err) => {
      console.error(`[StellarPrepareQueue] Failed to enqueue job ${paymentId}:`, err);
    });

    if (!this.draining) {
      void this.drain();
    }
  }

  /**
   * Resume processing any jobs left in the queue from a previous server run.
   * Call once at application startup.
   */
  resume(): void {
    if (!this.draining) {
      void this.drain();
    }
  }

  /** Approximate number of jobs waiting in Redis. */
  async size(): Promise<number> {
    try {
      return await redisClient.llen(QUEUE_KEY);
    } catch {
      return 0;
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const raw = await redisClient.lpop(QUEUE_KEY);
        if (!raw) break;

        let job: StellarPrepareJob;
        try {
          job = JSON.parse(raw) as StellarPrepareJob;
        } catch (parseErr) {
          console.error('[StellarPrepareQueue] Failed to parse job, discarding:', raw, parseErr);
          continue;
        }

        await this.process(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async process(job: StellarPrepareJob): Promise<void> {
    job.attempts++;
    try {
      const stellarService = new StellarService();
      await stellarService.prepareAccount(job.merchantId, job.paymentId);
      console.log(
        `[StellarPrepareQueue] Account prepared for payment ${job.paymentId} on attempt ${job.attempts}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[StellarPrepareQueue] Attempt ${job.attempts} failed for payment ${job.paymentId}: ${msg}`,
      );

      if (job.attempts < job.maxAttempts) {
        const delay = BASE_DELAY_MS * Math.pow(2, job.attempts - 1);
        console.log(
          `[StellarPrepareQueue] Re-queuing job ${job.paymentId} after ${delay}ms (attempt ${job.attempts}/${job.maxAttempts})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        await redisClient.lpush(QUEUE_KEY, JSON.stringify(job)).catch((pushErr) => {
          console.error(
            `[StellarPrepareQueue] Failed to re-queue job ${job.paymentId}:`,
            pushErr,
          );
        });
      } else {
        console.error(
          `[StellarPrepareQueue] Job ${job.paymentId} exhausted ${job.maxAttempts} attempts. Deposit address may be unusable.`,
        );
      }
    }
  }
}

export const stellarPrepareQueue = new StellarPrepareQueueService();
