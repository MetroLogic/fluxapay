import { getLogger } from "./logger";

const logger = getLogger("HorizonCircuitBreaker");

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  cooldownDuration?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  successCount: number;
  failureCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  consecutiveFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private consecutiveFailures: number = 0;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly cooldownDuration: number;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;
  private readonly onHalfOpen?: () => void;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 3;
    this.successThreshold = config.successThreshold ?? 1;
    this.timeout = config.timeout ?? 5000;
    this.cooldownDuration = config.cooldownDuration ?? 30000;
    this.onOpen = config.onOpen;
    this.onClose = config.onClose;
    this.onHalfOpen = config.onHalfOpen;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.onHalfOpen?.();
        logger.info("Circuit breaker transitioning to HALF_OPEN", { consecutiveFailures: this.consecutiveFailures });
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Circuit breaker timeout")), this.timeout)
      ),
    ]);
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        this.onClose?.();
        logger.info("Circuit breaker closed after successful recovery");
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.consecutiveFailures++;
    this.lastFailureTime = new Date();
    this.nextAttemptTime = new Date(Date.now() + this.cooldownDuration);

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.onOpen?.();
      logger.warn("Circuit breaker reopened after failed recovery attempt");
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.onOpen?.();
      logger.warn("Circuit breaker opened due to repeated failures", {
        failureCount: this.failureCount,
        failureThreshold: this.failureThreshold,
      });
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) return true;
    return Date.now() >= this.nextAttemptTime.getTime();
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
    logger.info("Circuit breaker reset");
  }
}

// Global singleton for Horizon API circuit breaker
export const horizonCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 1,
  timeout: 10000,
  cooldownDuration: 30000,
  onOpen: () => {
    logger.error("Horizon API circuit breaker opened - service degraded");
  },
  onClose: () => {
    logger.info("Horizon API circuit breaker closed - service recovered");
  },
  onHalfOpen: () => {
    logger.info("Horizon API circuit breaker half-open - attempting recovery");
  },
});
