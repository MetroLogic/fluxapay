import { CircuitBreaker, CircuitState } from "../horizonCircuitBreaker";

describe("HorizonCircuitBreaker", () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 1,
      timeout: 1000,
      cooldownDuration: 100,
    });
  });

  describe("CLOSED state", () => {
    it("should execute successful functions", async () => {
      const fn = jest.fn().mockResolvedValue("success");
      const result = await circuitBreaker.execute(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should track single failure without opening", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("fail"));
      await expect(circuitBreaker.execute(fn)).rejects.toThrow("fail");

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should open after reaching failure threshold", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      const stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(3);
    });

    it("should reset failure count on success", async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("success")
        .mockRejectedValueOnce(new Error("fail"));

      await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      await circuitBreaker.execute(fn);
      await expect(circuitBreaker.execute(fn)).rejects.toThrow();

      const stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(1);
      expect(stats.failureCount).toBe(2);
    });
  });

  describe("OPEN state", () => {
    beforeEach(async () => {
      const fn = jest.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it("should reject calls immediately", async () => {
      const fn = jest.fn().mockResolvedValue("success");

      await expect(circuitBreaker.execute(fn)).rejects.toThrow("Circuit breaker is OPEN");
      expect(fn).not.toHaveBeenCalled();
    });

    it("should transition to HALF_OPEN after cooldown", async () => {
      await new Promise(resolve => setTimeout(resolve, 150));

      const fn = jest.fn().mockResolvedValue("success");
      const result = await circuitBreaker.execute(fn);

      expect(result).toBe("success");
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe("HALF_OPEN state", () => {
    beforeEach(async () => {
      const fn = jest.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    it("should close after successful recovery attempt", async () => {
      const fn = jest.fn().mockResolvedValue("success");
      await circuitBreaker.execute(fn);

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.failureCount).toBe(0);
    });

    it("should reopen after failed recovery attempt", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("fail"));

      await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      const stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(4);
    });
  });

  describe("Timeout", () => {
    it("should reject when function exceeds timeout", async () => {
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 5000));

      await expect(circuitBreaker.execute(slowFn as any)).rejects.toThrow("Circuit breaker timeout");
    });

    it("should count timeout as failure", async () => {
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 2000));
      const fastFn = jest.fn().mockRejectedValue(new Error("fail"));

      await expect(circuitBreaker.execute(slowFn as any)).rejects.toThrow();
      await expect(circuitBreaker.execute(fastFn)).rejects.toThrow();

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(2);
    });
  });

  describe("Reset", () => {
    it("should reset to CLOSED state", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe("Callbacks", () => {
    it("should call onOpen callback when opening", async () => {
      const onOpen = jest.fn();
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        onOpen,
      });

      const fn = jest.fn().mockRejectedValue(new Error("fail"));
      await expect(cb.execute(fn)).rejects.toThrow();

      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("should call onClose callback when closing from HALF_OPEN", async () => {
      const onClose = jest.fn();
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        cooldownDuration: 50,
        onClose,
      });

      const failFn = jest.fn().mockRejectedValue(new Error("fail"));
      const successFn = jest.fn().mockResolvedValue("ok");

      await expect(cb.execute(failFn)).rejects.toThrow();
      await new Promise(resolve => setTimeout(resolve, 100));
      await cb.execute(successFn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onHalfOpen callback when transitioning to HALF_OPEN", async () => {
      const onHalfOpen = jest.fn();
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        cooldownDuration: 50,
        onHalfOpen,
      });

      const fn = jest.fn().mockRejectedValue(new Error("fail"));
      await expect(cb.execute(fn)).rejects.toThrow();
      await new Promise(resolve => setTimeout(resolve, 100));

      const successFn = jest.fn().mockResolvedValue("ok");
      await cb.execute(successFn);

      expect(onHalfOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe("Stats", () => {
    it("should track successCount in HALF_OPEN state", async () => {
      const fn = jest.fn()
        .mockRejectedValue(new Error("fail"))
        .mockRejectedValue(new Error("fail"))
        .mockRejectedValue(new Error("fail"))
        .mockResolvedValue("success");

      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      await new Promise(resolve => setTimeout(resolve, 150));

      const halfOpenStats = circuitBreaker.getStats();
      expect(halfOpenStats.state).toBe(CircuitState.HALF_OPEN);

      await circuitBreaker.execute(fn);

      const closedStats = circuitBreaker.getStats();
      expect(closedStats.state).toBe(CircuitState.CLOSED);
      expect(closedStats.successCount).toBe(0); // Reset after close
    });
  });
});
