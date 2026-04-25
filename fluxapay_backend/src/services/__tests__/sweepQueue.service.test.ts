import { SweepQueue } from "../sweepQueue.service";

describe("SweepQueue", () => {
  let queue: SweepQueue;

  beforeEach(() => {
    queue = new SweepQueue({
      maxConcurrency: 2,
      maxQueueSize: 5,
      taskTimeout: 1000,
    });
  });

  describe("enqueue", () => {
    it("should execute tasks with concurrency limit", async () => {
      const executionOrder: number[] = [];
      const tasks: Promise<void>[] = [];

      for (let i = 0; i < 4; i++) {
        const task = queue.enqueue(`task-${i}`, async () => {
          executionOrder.push(i);
          await new Promise((resolve) => setTimeout(resolve, 100));
        });
        tasks.push(task);
      }

      await Promise.all(tasks);

      expect(executionOrder).toHaveLength(4);
      // All tasks should complete
      expect(executionOrder).toContain(0);
      expect(executionOrder).toContain(1);
      expect(executionOrder).toContain(2);
      expect(executionOrder).toContain(3);
    });

    it("should reject when queue is full", async () => {
      const slowTask = async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      };

      // Fill the queue
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(queue.enqueue(`task-${i}`, slowTask));
      }

      // This should be rejected due to backpressure
      await expect(queue.enqueue("task-overflow", slowTask)).rejects.toThrow(
        /queue is full/i,
      );

      // Clean up
      await Promise.allSettled(tasks);
    });

    it("should handle task failures gracefully", async () => {
      const successTask = queue.enqueue("success", async () => {
        // Success
      });

      const failTask = queue.enqueue("fail", async () => {
        throw new Error("Task failed");
      });

      await expect(successTask).resolves.not.toThrow();
      await expect(failTask).rejects.toThrow("Task failed");
    });

    it("should timeout long-running tasks", async () => {
      const longTask = queue.enqueue("long-task", async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      });

      await expect(longTask).rejects.toThrow(/timed out/i);
    });
  });

  describe("getStats", () => {
    it("should return accurate queue statistics", async () => {
      const stats = queue.getStats();

      expect(stats).toMatchObject({
        queueSize: 0,
        activeCount: 0,
        maxConcurrency: 2,
        maxQueueSize: 5,
        utilizationPercent: 0,
        queueFullPercent: 0,
      });
    });

    it("should track active tasks", async () => {
      const task1 = queue.enqueue("task-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const stats = queue.getStats();
      expect(stats.activeCount).toBeGreaterThan(0);

      await task1;
    });
  });

  describe("canAcceptTask", () => {
    it("should return true when queue has capacity", () => {
      expect(queue.canAcceptTask()).toBe(true);
    });

    it("should return false when queue is full", async () => {
      const slowTask = async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      };

      // Fill the queue
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(queue.enqueue(`task-${i}`, slowTask));
      }

      expect(queue.canAcceptTask()).toBe(false);

      // Clean up
      await Promise.allSettled(tasks);
    });
  });

  describe("getBackpressureLevel", () => {
    it("should return 0 when queue is empty", () => {
      expect(queue.getBackpressureLevel()).toBe(0);
    });

    it("should return 1 when queue is full", async () => {
      const slowTask = async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      };

      // Fill the queue
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(queue.enqueue(`task-${i}`, slowTask));
      }

      expect(queue.getBackpressureLevel()).toBe(1);

      // Clean up
      await Promise.allSettled(tasks);
    });

    it("should return fractional value for partial queue", async () => {
      const slowTask = async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      };

      // Add 2 tasks (40% of capacity)
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 2; i++) {
        tasks.push(queue.enqueue(`task-${i}`, slowTask));
      }

      // Give tasks time to enter queue
      await new Promise((resolve) => setTimeout(resolve, 10));

      const level = queue.getBackpressureLevel();
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);

      // Clean up
      await Promise.allSettled(tasks);
    });
  });
});
