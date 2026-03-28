import type { SmsProvider } from "./smsProvider.interface";
import { TwilioSmsProvider } from "./twilioSms.provider";
import { MessageBirdSmsProvider } from "./messageBirdSms.provider";
import { MockSmsProvider } from "./mockSms.provider";

export type SmsDriver = "none" | "twilio" | "messagebird" | "mock";

let cached: { driver: SmsDriver; provider: SmsProvider } | null = null;

function readDriver(): SmsDriver {
  const v = (process.env.SMS_PROVIDER || "none").toLowerCase();
  if (
    v === "twilio" ||
    v === "messagebird" ||
    v === "mock" ||
    v === "none"
  ) {
    return v;
  }
  return "none";
}

/**
 * Resolves SMS provider from env. Cached per process.
 */
export function getSmsProvider(): SmsProvider {
  const driver = readDriver();
  if (cached && cached.driver === driver) {
    return cached.provider;
  }

  let provider: SmsProvider;
  switch (driver) {
    case "twilio": {
      const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
      const token = process.env.TWILIO_AUTH_TOKEN ?? "";
      const from = process.env.TWILIO_FROM_NUMBER ?? "";
      provider = new TwilioSmsProvider(sid, token, from);
      break;
    }
    case "messagebird": {
      const key = process.env.MESSAGEBIRD_API_KEY ?? "";
      const originator = process.env.MESSAGEBIRD_ORIGINATOR ?? "FluxaPay";
      provider = new MessageBirdSmsProvider(key, originator);
      break;
    }
    case "mock":
      provider = new MockSmsProvider();
      break;
    default: {
      provider = {
        async sendSms() {
          throw new Error("SMS_PROVIDER is none — SMS OTP is disabled");
        },
      };
    }
  }

  cached = { driver, provider };
  return provider;
}

/** Test helper: clear cached provider after env changes */
export function resetSmsProviderCacheForTests(): void {
  cached = null;
}
