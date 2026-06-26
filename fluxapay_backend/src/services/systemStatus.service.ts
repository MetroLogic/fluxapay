import { getSmsProviderHealth } from "../sms/smsProvider.factory";

export function getSystemStatus() {
  const sms = getSmsProviderHealth();

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    sms,
  };
}
