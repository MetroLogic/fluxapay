import type { SmsDriver, SmsProvider } from "./smsProvider.interface";
import { getLogger } from "../utils/logger";

const logger = getLogger("SmsFailover");

export type SmsProviderHealthStatus =
  | "healthy"
  | "degraded"
  | "unknown"
  | "disabled";

export type SmsProviderHealth = {
  driver: SmsDriver;
  status: SmsProviderHealthStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

const healthByDriver = new Map<SmsDriver, SmsProviderHealth>();

function initHealth(driver: SmsDriver): SmsProviderHealth {
  const existing = healthByDriver.get(driver);
  if (existing) return existing;

  const health: SmsProviderHealth = {
    driver,
    status: driver === "none" ? "disabled" : "unknown",
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
  healthByDriver.set(driver, health);
  return health;
}

function recordSuccess(driver: SmsDriver): void {
  const health = initHealth(driver);
  health.status = "healthy";
  health.lastSuccessAt = new Date().toISOString();
  health.lastError = null;
}

function recordFailure(driver: SmsDriver, error: string): void {
  const health = initHealth(driver);
  health.status = "degraded";
  health.lastFailureAt = new Date().toISOString();
  health.lastError = error;
}

export function getSmsProviderHealthSnapshot(
  primaryDriver: SmsDriver,
  fallbackDriver: SmsDriver | null,
): { primary: SmsProviderHealth; fallback: SmsProviderHealth | null } {
  return {
    primary: { ...initHealth(primaryDriver) },
    fallback: fallbackDriver ? { ...initHealth(fallbackDriver) } : null,
  };
}

export function resetSmsProviderHealthForTests(): void {
  healthByDriver.clear();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function smsDeliveryFailed(primaryError: string, fallbackError: string | null) {
  return {
    status: 502,
    message: "sms_delivery_failed",
    primaryError,
    ...(fallbackError ? { fallbackError } : {}),
  };
}

export class FailoverSmsProvider implements SmsProvider {
  constructor(
    private readonly primary: SmsProvider,
    private readonly fallback: SmsProvider | null,
    private readonly primaryDriver: SmsDriver,
    private readonly fallbackDriver: SmsDriver | null,
  ) {}

  async sendSms(toE164: string, body: string): Promise<void> {
    try {
      await this.primary.sendSms(toE164, body);
      recordSuccess(this.primaryDriver);
      return;
    } catch (primaryErr) {
      const primaryReason = errorMessage(primaryErr);
      recordFailure(this.primaryDriver, primaryReason);

      if (!this.fallback || !this.fallbackDriver) {
        throw smsDeliveryFailed(primaryReason, null);
      }

      logger.warn("SMS primary provider failed, retrying via fallback", {
        event: "sms_provider_fallback",
        primaryDriver: this.primaryDriver,
        fallbackDriver: this.fallbackDriver,
        primaryError: primaryReason,
      });

      try {
        await this.fallback.sendSms(toE164, body);
        recordSuccess(this.fallbackDriver);
      } catch (fallbackErr) {
        const fallbackReason = errorMessage(fallbackErr);
        recordFailure(this.fallbackDriver, fallbackReason);
        throw smsDeliveryFailed(primaryReason, fallbackReason);
      }
    }
  }
}
