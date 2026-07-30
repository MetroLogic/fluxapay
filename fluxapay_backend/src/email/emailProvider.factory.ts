import type { EmailDriver, EmailProvider } from "./emailProvider.interface";
import { ResendEmailProvider } from "./resendEmail.provider";
import { SendGridEmailProvider } from "./sendGridEmail.provider";
import { MockEmailProvider } from "./mockEmail.provider";
import {
  FailoverEmailProvider,
  getEmailProviderHealthSnapshot,
  resetEmailProviderHealthForTests,
  type EmailProviderHealth,
} from "./failoverEmail.provider";

export type { EmailDriver } from "./emailProvider.interface";

export type EmailProviderConfig = {
  primary: EmailDriver;
  fallback: EmailDriver | null;
  configured: boolean;
};

type CachedProviders = {
  primary: EmailDriver;
  fallback: EmailDriver | null;
  provider: EmailProvider;
};

let cached: CachedProviders | null = null;

type TestOverride = {
  primary: EmailProvider;
  fallback: EmailProvider | null;
  primaryDriver: EmailDriver;
  fallbackDriver: EmailDriver | null;
};

let testOverride: TestOverride | null = null;

function parseDriver(
  value: string | undefined,
  allowNone = true,
): EmailDriver | null {
  const v = (value || "").toLowerCase().trim();
  if (!v) return null;
  if (v === "resend" || v === "sendgrid" || v === "mock") return v;
  if (allowNone && v === "none") return "none";
  return null;
}

function readPrimaryDriver(): EmailDriver {
  return parseDriver(process.env.EMAIL_PROVIDER, true) ?? "resend";
}

function readFallbackDriver(): EmailDriver | null {
  const driver = parseDriver(process.env.EMAIL_FALLBACK_PROVIDER, true);
  if (!driver || driver === "none") return null;
  return driver;
}

function createProviderForDriver(driver: EmailDriver): EmailProvider {
  switch (driver) {
    case "resend":
      return new ResendEmailProvider();
    case "sendgrid":
      return new SendGridEmailProvider();
    case "mock":
      return new MockEmailProvider();
    default:
      return {
        async sendEmail() {
          throw new Error("EMAIL_PROVIDER is none — email is disabled");
        },
      };
  }
}

function resolveEffectiveFallback(
  primary: EmailDriver,
  fallback: EmailDriver | null,
): EmailDriver | null {
  if (!fallback || fallback === primary) return null;
  return fallback;
}

export function getEmailProviderConfig(): EmailProviderConfig {
  const primary = readPrimaryDriver();
  const fallback = resolveEffectiveFallback(primary, readFallbackDriver());
  return {
    primary,
    fallback,
    configured: primary !== "none",
  };
}

export function getEmailProviderHealth(): {
  configured: boolean;
  primary: EmailProviderHealth;
  fallback: EmailProviderHealth | null;
} {
  const config = getEmailProviderConfig();
  const health = getEmailProviderHealthSnapshot(config.primary, config.fallback);
  return {
    configured: config.configured,
    primary: health.primary,
    fallback: health.fallback,
  };
}

export function getEmailProvider(): EmailProvider {
  if (testOverride) {
    return new FailoverEmailProvider(
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

  const provider = new FailoverEmailProvider(
    primaryProvider,
    fallbackProvider,
    primary,
    fallback,
  );

  cached = { primary, fallback, provider };
  return provider;
}

export function setEmailProvidersForTests(
  primary: EmailProvider,
  options?: {
    fallback?: EmailProvider | null;
    primaryDriver?: EmailDriver;
    fallbackDriver?: EmailDriver | null;
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

export function resetEmailProviderCacheForTests(): void {
  cached = null;
  testOverride = null;
  resetEmailProviderHealthForTests();
}
