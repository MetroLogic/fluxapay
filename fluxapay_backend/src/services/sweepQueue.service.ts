/**
 * sweepQueue.service.ts
 *
 * Implements concurrency control and backpressure for sweep operations.
 * Prevents overwhelming the Stellar network with too many simultaneous transactions.
 */

import { getLogger, getMetricsCollector } from "../utils/logger";

interface SweepTask {
  id: string;
  execute: () => Promise<void>;
  resolve: (value: void) => void;
  reject: (error: Error) => void;
  addedAt: number;
}

export class SweepQueue {
  private queue: SweepTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private readonly taskTimeout: number;
  private readonly logger = getLogger("SweepQueue");
  private readonly metrics = getMetricsCollector();
  private isProcessing = false;

  constructor(options?: {
    maxConcurrency?: number;
    maxQueueSize?: number;
    taskTimeout?: number;
  }) {
    // Default: 5 concurrent sweep transactions
    this.maxConcurrency =
      options?.maxConcurrency ??
      parseInt(process.env.SWEEP_MAX_CONCURRENCY || "5", 10);

    // Default: max 100 tasks in queue (backpressure threshold)
    this.maxQueueSize =
      options?.maxQueueSize ??
      parseInt(process.env.SWEEP_MAX_QUEUE_SIZE || "100", 10);

    // Default: 60 second timeout per sweep transaction
    this.taskTimeout =
      options?.taskTimeout ??
      parseInt(process.env.SWEEP_TASK_TIMEOUT_MS || "60000", 10);

    this.logger.info("SweepQueue initialized", {
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
      taskTimeout: this.taskTimeout,
    });
  }

  /**
   * Add a sweep task to the queue with backpressure control.
   * Throws an error if the queue is full.
   */
  async enqueue(taskId: string, task: () => Promise<void>): Promise<void> {
    // Backpressure: reject if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.metrics.increment("sweep_queue.backpressure_rejected");
      throw new Error(
        `Sweep queue is full (${this.maxQueueSize} tasks). Please retry later.`,
      );
    }

    return new Promise<void>((resolve, reject) => {
      const sweepTask: SweepTask = {
        id: taskId,
        execute: task,
        resolve,
        reject,
        addedAt: Date.now(),
      };

      this.queue.push(sweepTask);
      this.metrics.gauge("sweep_queue.size", this.queue.length);
      this.metrics.increment("sweep_queue.enqueued");

      this.logger.debug("Task enqueued", {
        taskId,
        queueSize: this.queue.length,
        activeCount: this.activeCount,
      });

      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Process tasks from the queue respecting concurrency limits.
   */
  private async processQueue(): Promise<void> {
    // Prevent multiple concurrent processQueue calls
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
        const task = this.queue.shift();
        if (!task) break;

        this.activeCount++;
        this.metrics.gauge("sweep_queue.active", this.activeCount);
        this.metrics.gauge("sweep_queue.size", this.queue.length);

        // Execute task with timeout
        this.executeTask(task).finally(() => {
          this.activeCount--;
          this.metrics.gauge("sweep_queue.active", this.activeCount);

          // Continue processing queue
          this.isProcessing = false;
          this.processQueue();
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single sweep task with timeout protection.
   */
  private async executeTask(task: SweepTask): Promise<void> {
    const startTime = Date.now();

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Sweep task ${task.id} timed out after ${this.taskTimeout}ms`,
            ),
          );
        }, this.taskTimeout);
      });

      // Race between task execution and timeout
      await Promise.race([task.execute(), timeoutPromise]);

      const duration = Date.now() - startTime;
      const queueWaitTime = startTime - task.addedAt;

      this.metrics.gauge("sweep_queue.task_duration_ms", duration);
      this.metrics.gauge("sweep_queue.wait_time_ms", queueWaitTime);
      this.metrics.increment("sweep_queue.completed");

      this.logger.debug("Task completed", {
        taskId: task.id,
        duration,
        queueWaitTime,
      });

      task.resolve();
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.metrics.increment("sweep_queue.failed", {
        error: errorMessage.substring(0, 50),
      });

      this.logger.error("Task failed", {
        taskId: task.id,
        duration,
        error: errorMessage,
      });

      task.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get current queue statistics.
   */
  getStats() {
    return {
      queueSize: this.queue.length,
      activeCount: this.activeCount,
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
      utilizationPercent: (this.activeCount / this.maxConcurrency) * 100,
      queueFullPercent: (this.queue.length / this.maxQueueSize) * 100,
    };
  }

  /**
   * Check if the queue is accepting new tasks (not at capacity).
   */
  canAcceptTask(): boolean {
    return this.queue.length < this.maxQueueSize;
  }

  /**
   * Get the current backpressure level (0-1, where 1 is full).
   */
  getBackpressureLevel(): number {
    return this.queue.length / this.maxQueueSize;
  }
}

// Singleton instance
export const sweepQueue = new SweepQueue();
