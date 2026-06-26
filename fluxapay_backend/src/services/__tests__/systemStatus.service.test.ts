import {
  getSmsProvider,
  getSmsProviderHealth,
  resetSmsProviderCacheForTests,
  setSmsProvidersForTests,
} from "../../sms/smsProvider.factory";
import type { SmsProvider } from "../../sms/smsProvider.interface";
import { getSystemStatus } from "../systemStatus.service";

describe("systemStatus.service", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...saved,
      SMS_PROVIDER: "mock",
      SMS_FALLBACK_PROVIDER: "messagebird",
    };
    resetSmsProviderCacheForTests();
  });

  afterAll(() => {
    process.env = saved;
    resetSmsProviderCacheForTests();
  });

  it("exposes SMS provider health in admin system status", async () => {
    const successProvider: SmsProvider = {
      async sendSms() {},
    };

    setSmsProvidersForTests(successProvider, {
      fallback: successProvider,
      primaryDriver: "mock",
      fallbackDriver: "messagebird",
    });

    await getSmsProvider().sendSms("+12025550123", "health probe");

    const status = getSystemStatus();
    const health = getSmsProviderHealth();

    expect(status).toMatchObject({
      status: "ok",
      sms: health,
    });
    expect(status.sms.configured).toBe(true);
    expect(status.sms.primary).toMatchObject({
      driver: "mock",
      status: "healthy",
    });
    expect(status.sms.fallback).toMatchObject({
      driver: "messagebird",
      status: "unknown",
    });
    expect(status.sms.primary.lastSuccessAt).toEqual(expect.any(String));
  });
});
