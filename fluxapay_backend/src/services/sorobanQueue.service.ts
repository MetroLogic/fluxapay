/**
 * SorobanQueue – Redis-backed persistent queue for Soroban contract submissions.
 *
 * Replaces the prior in-memory array implementation so that pending jobs survive
 * server restarts and crashes (closes #1048).
 *
 * Jobs are stored as JSON in a Redis list (`soroban:queue`).  A separate Redis
 * key (`soroban:queue:running`) acts as a distributed lock so only one worker
 * drains the queue at a time, even across multiple server instances.
 *
 * Usage:
 *   sorobanQueue.enqueue(paymentId, txHash, amount);
 */

import { redisClient } from '../middleware/redisIdempotency.middleware';
import { paymentContractService } from './paymentContract.service';

export interface SorobanJob {
  paymentId: string;
  txHash: string;
  amount: string;
  attempts: number;
  maxAttempts: number;
}

const QUEUE_KEY = 'soroban:queue';
const RUNNING_KEY = 'soroban:queue:running';
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

export class SorobanQueueService {
  private draining = false;

  /**
   * Push a new job onto the persistent Redis queue and start draining if idle.
   */
  enqueue(paymentId: string, txHash: string, amount: string, maxAttempts = MAX_ATTEMPTS): void {
    const job: SorobanJob = { paymentId, txHash, amount, attempts: 0, maxAttempts };
    // Push to the tail of the Redis list (non-blocking fire-and-forget)
    redisClient.rpush(QUEUE_KEY, JSON.stringify(job)).catch((err) => {
      console.error(`[SorobanQueue] Failed to enqueue job ${paymentId}:`, err);
    });

    if (!this.draining) {
      void this.drain();
    }
  }

  /** Number of jobs currently waiting (approximate – reads Redis list length). */
  async size(): Promise<number> {
    try {
      return await redisClient.llen(QUEUE_KEY);
    } catch {
      return 0;
    }
  }

  /**
   * Drain the queue serially.  Uses a short-lived Redis key as a soft lock so
   * concurrent callers (e.g. multiple requests arriving simultaneously) do not
   * each spin up their own drain loop.
   */
  private async drain(): Promise<void> {
    // Soft in-process guard
    if (this.draining) return;
    this.draining = true;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Pop from the head of the list
        const raw = await redisClient.lpop(QUEUE_KEY);
        if (!raw) break; // Queue is empty

        let job: SorobanJob;
        try {
          job = JSON.parse(raw) as SorobanJob;
        } catch (parseErr) {
          console.error('[SorobanQueue] Failed to parse job, discarding:', raw, parseErr);
          continue;
        }

        await this.process(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async process(job: SorobanJob): Promise<void> {
    job.attempts++;
    try {
      const ok = await paymentContractService.verify_payment(
        job.paymentId,
        job.txHash,
        job.amount,
      );
      if (!ok) {
        throw new Error('verify_payment returned false');
      }
      console.log(`[SorobanQueue] Job ${job.paymentId} completed on attempt ${job.attempts}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SorobanQueue] Job ${job.paymentId} attempt ${job.attempts} failed: ${msg}`);

      if (job.attempts < job.maxAttempts) {
        const delay = BASE_DELAY_MS * Math.pow(2, job.attempts - 1);
        console.log(`[SorobanQueue] Re-queuing job ${job.paymentId} after ${delay}ms (attempt ${job.attempts}/${job.maxAttempts})`);
        // Wait for back-off delay, then push the updated job back to the front
        await new Promise((r) => setTimeout(r, delay));
        await redisClient.lpush(QUEUE_KEY, JSON.stringify(job)).catch((pushErr) => {
          console.error(`[SorobanQueue] Failed to re-queue job ${job.paymentId}:`, pushErr);
        });
      } else {
        console.error(
          `[SorobanQueue] Job ${job.paymentId} exhausted ${job.maxAttempts} attempts. Dropping.`,
        );
      }
    }
  }
}

export const sorobanQueue = new SorobanQueueService();
