import type { SmsDriver, SmsProvider } from "./smsProvider.interface";
import { TwilioSmsProvider } from "./twilioSms.provider";
import { MessageBirdSmsProvider } from "./messageBirdSms.provider";
import { MockSmsProvider } from "./mockSms.provider";
import {
  FailoverSmsProvider,
  getSmsProviderHealthSnapshot,
  resetSmsProviderHealthForTests,
  type SmsProviderHealth,
} from "./failoverSms.provider";

export type { SmsDriver } from "./smsProvider.interface";

export type SmsProviderConfig = {
  primary: SmsDriver;
  fallback: SmsDriver | null;
  configured: boolean;
};

type CachedProviders = {
  primary: SmsDriver;
  fallback: SmsDriver | null;
  provider: SmsProvider;
};

let cached: CachedProviders | null = null;

type TestOverride = {
  primary: SmsProvider;
  fallback: SmsProvider | null;
  primaryDriver: SmsDriver;
  fallbackDriver: SmsDriver | null;
};

let testOverride: TestOverride | null = null;

function parseDriver(
  value: string | undefined,
  allowNone = true,
): SmsDriver | null {
  const v = (value || "").toLowerCase().trim();
  if (!v) return null;
  if (v === "twilio" || v === "messagebird" || v === "mock") return v;
  if (allowNone && v === "none") return "none";
  return null;
}

function readPrimaryDriver(): SmsDriver {
  return parseDriver(process.env.SMS_PROVIDER, true) ?? "none";
}

function readFallbackDriver(): SmsDriver | null {
  const driver = parseDriver(process.env.SMS_FALLBACK_PROVIDER, true);
  if (!driver || driver === "none") return null;
  return driver;
}

function createProviderForDriver(driver: SmsDriver): SmsProvider {
  switch (driver) {
    case "twilio": {
      const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
      const token = process.env.TWILIO_AUTH_TOKEN ?? "";
      const from = process.env.TWILIO_FROM_NUMBER ?? "";
      return new TwilioSmsProvider(sid, token, from);
    }
    case "messagebird": {
      const key = process.env.MESSAGEBIRD_API_KEY ?? "";
      const originator = process.env.MESSAGEBIRD_ORIGINATOR ?? "FluxaPay";
      return new MessageBirdSmsProvider(key, originator);
    }
    case "mock":
      return new MockSmsProvider();
    default:
      return {
        async sendSms() {
          throw new Error("SMS_PROVIDER is none — SMS OTP is disabled");
        },
      };
  }
}

function resolveEffectiveFallback(
  primary: SmsDriver,
  fallback: SmsDriver | null,
): SmsDriver | null {
  if (!fallback || fallback === primary) return null;
  return fallback;
}

export function getSmsProviderConfig(): SmsProviderConfig {
  const primary = readPrimaryDriver();
  const fallback = resolveEffectiveFallback(primary, readFallbackDriver());
  return {
    primary,
    fallback,
    configured: primary !== "none",
  };
}

export function getSmsProviderHealth(): {
  configured: boolean;
  primary: SmsProviderHealth;
  fallback: SmsProviderHealth | null;
} {
  const config = getSmsProviderConfig();
  const health = getSmsProviderHealthSnapshot(config.primary, config.fallback);
  return {
    configured: config.configured,
    primary: health.primary,
    fallback: health.fallback,
  };
}

/**
 * Resolves SMS provider from env with optional fallback failover. Cached per process.
 */
export function getSmsProvider(): SmsProvider {
  if (testOverride) {
    return new FailoverSmsProvider(
      testOverride.primary,
      testOverride.fallback,
      testOverride.primaryDriver,
      testOverride.fallbackDriver,
    );
  }

  const primary = readPrimaryDriver();
  const fallback = resolveEffectiveFallback(primary, readFallbackDriver());

  if (cached && cached.primary === primary && cached.fallback === fallback) {
    return cached.provider;
  }

  if (primary === "none") {
    const provider = createProviderForDriver("none");
    cached = { primary, fallback: null, provider };
    return provider;
  }

  const primaryProvider = createProviderForDriver(primary);
  const fallbackProvider = fallback
    ? createProviderForDriver(fallback)
    : null;

  const provider = new FailoverSmsProvider(
    primaryProvider,
    fallbackProvider,
    primary,
    fallback,
  );

  cached = { primary, fallback, provider };
  return provider;
}

/** Test helper: inject custom primary/fallback providers */
export function setSmsProvidersForTests(
  primary: SmsProvider,
  options?: {
    fallback?: SmsProvider | null;
    primaryDriver?: SmsDriver;
    fallbackDriver?: SmsDriver | null;
  },
): void {
  testOverride = {
    primary,
    fallback: options?.fallback ?? null,
    primaryDriver: options?.primaryDriver ?? "mock",
    fallbackDriver: options?.fallbackDriver ?? null,
  };
  cached = null;
}

/** Test helper: clear cached provider after env changes */
export function resetSmsProviderCacheForTests(): void {
  cached = null;
  testOverride = null;
  resetSmsProviderHealthForTests();
}
