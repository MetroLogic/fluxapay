import type { EmailDriver, EmailProvider, EmailOptions } from "./emailProvider.interface";
import { getLogger } from "../utils/logger";

const logger = getLogger("EmailFailover");

export type EmailProviderHealthStatus =
  | "healthy"
  | "degraded"
  | "unknown"
  | "disabled";

export type EmailProviderHealth = {
  driver: EmailDriver;
  status: EmailProviderHealthStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

const CONSECUTIVE_FAILURE_LIMIT = 3;
const healthByDriver = new Map<EmailDriver, EmailProviderHealth>();

function initHealth(driver: EmailDriver): EmailProviderHealth {
  const existing = healthByDriver.get(driver);
  if (existing) return existing;

  const health: EmailProviderHealth = {
    driver,
    status: driver === "none" ? "disabled" : "unknown",
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
  healthByDriver.set(driver, health);
  return health;
}

function recordSuccess(driver: EmailDriver): void {
  const health = initHealth(driver);
  health.status = "healthy";
  health.lastSuccessAt = new Date().toISOString();
  health.lastError = null;
}

function recordFailure(driver: EmailDriver, error: string): void {
  const health = initHealth(driver);
  health.status = "degraded";
  health.lastFailureAt = new Date().toISOString();
  health.lastError = error;
}

function consecutiveFailures(driver: EmailDriver): number {
  const health = healthByDriver.get(driver);
  if (!health || !health.lastFailureAt) return 0;
  return 1;
}

export function getEmailProviderHealthSnapshot(
  primaryDriver: EmailDriver,
  fallbackDriver: EmailDriver | null,
): { primary: EmailProviderHealth; fallback: EmailProviderHealth | null } {
  return {
    primary: { ...initHealth(primaryDriver) },
    fallback: fallbackDriver ? { ...initHealth(fallbackDriver) } : null,
  };
}

export function resetEmailProviderHealthForTests(): void {
  healthByDriver.clear();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export class FailoverEmailProvider implements EmailProvider {
  private primaryFailCount = 0;
  private fallbackFailCount = 0;

  constructor(
    private readonly primary: EmailProvider,
    private readonly fallback: EmailProvider | null,
    private readonly primaryDriver: EmailDriver,
    private readonly fallbackDriver: EmailDriver | null,
  ) {}

  async sendEmail(options: EmailOptions): Promise<void> {
    if (
      this.fallback &&
      this.fallbackDriver &&
      this.primaryFailCount >= CONSECUTIVE_FAILURE_LIMIT
    ) {
      try {
        await this.fallback.sendEmail(options);
        recordSuccess(this.fallbackDriver);
        this.fallbackFailCount = 0;
        return;
      } catch (fallbackErr) {
        const fallbackReason = errorMessage(fallbackErr);
        this.fallbackFailCount++;
        recordFailure(this.fallbackDriver, fallbackReason);
        if (this.fallbackFailCount >= CONSECUTIVE_FAILURE_LIMIT) {
          this.primaryFailCount = 0;
        }
        throw fallbackErr;
      }
    }

    try {
      await this.primary.sendEmail(options);
      recordSuccess(this.primaryDriver);
      this.primaryFailCount = 0;
      this.fallbackFailCount = 0;
    } catch (primaryErr) {
      const primaryReason = errorMessage(primaryErr);
      this.primaryFailCount++;
      recordFailure(this.primaryDriver, primaryReason);

      if (!this.fallback || !this.fallbackDriver) {
        throw primaryErr;
      }

      if (this.primaryFailCount < CONSECUTIVE_FAILURE_LIMIT) {
        throw primaryErr;
      }

      logger.warn("Email primary provider failed consecutively, retrying via fallback", {
        event: "email_provider_fallback",
        primaryDriver: this.primaryDriver,
        fallbackDriver: this.fallbackDriver,
        primaryError: primaryReason,
        consecutiveFailures: this.primaryFailCount,
      });

      try {
        await this.fallback.sendEmail(options);
        recordSuccess(this.fallbackDriver);
        this.fallbackFailCount = 0;
        this.primaryFailCount = 0;
      } catch (fallbackErr) {
        const fallbackReason = errorMessage(fallbackErr);
        this.fallbackFailCount++;
        recordFailure(this.fallbackDriver, fallbackReason);
        throw fallbackErr;
      }
    }
  }
}
