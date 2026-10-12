import { getSmsProviderHealth } from "../sms/smsProvider.factory";
import { getEmailProviderHealth } from "../email/emailProvider.factory";

export function getSystemStatus() {
  const sms = getSmsProviderHealth();
  const email = getEmailProviderHealth();

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    sms,
    email,
  };
}
