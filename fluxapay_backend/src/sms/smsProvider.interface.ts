/**
 * Pluggable SMS delivery for OTP and other transactional texts.
 */
export interface SmsProvider {
  /** Send SMS to E.164 number (e.g. +15551234567). */
  sendSms(toE164: string, body: string): Promise<void>;
}
