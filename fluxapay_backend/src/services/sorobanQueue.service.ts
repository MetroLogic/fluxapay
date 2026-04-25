/**
 * SorobanQueue – in-process queue for Soroban contract submissions.
 *
 * Prevents concurrent RPC calls from racing each other and provides
 * automatic retry with exponential back-off for transient failures.
 *
 * Usage:
 *   sorobanQueue.enqueue(paymentId, txHash, amount);
 */

import { paymentContractService } from './paymentContract.service';

export interface SorobanJob {
  paymentId: string;
  txHash: string;
  amount: string;
  attempts: number;
  maxAttempts: number;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

export class SorobanQueueService {
  private queue: SorobanJob[] = [];
  private running = false;

  /**
   * Add a contract-submission job to the queue.
   * Returns immediately; processing happens asynchronously.
   */
  enqueue(paymentId: string, txHash: string, amount: string, maxAttempts = MAX_ATTEMPTS): void {
    this.queue.push({ paymentId, txHash, amount, attempts: 0, maxAttempts });
    if (!this.running) {
      void this.drain();
    }
  }

  /** Number of jobs currently waiting. */
  get size(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      await this.process(job);
    }
    this.running = false;
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
        console.log(`[SorobanQueue] Retrying job ${job.paymentId} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        this.queue.unshift(job); // re-queue at front for immediate retry
      } else {
        console.error(
          `[SorobanQueue] Job ${job.paymentId} exhausted ${job.maxAttempts} attempts. Dropping.`,
        );
      }
    }
  }
}

export const sorobanQueue = new SorobanQueueService();
