export const SENSITIVE_BANK_FIELDS = ["accountNumber", "iban", "swift"] as const;

/** Strip sensitive values from a bank slice before it is persisted. */
export function redactBankForDraft(
  bank: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...bank };
  for (const field of SENSITIVE_BANK_FIELDS) {
    delete safe[field];
  }
  return safe;
}

/** Mask sensitive bank values in the review step while keeping the last four visible. */
export function maskBankDetail(value: string): string {
  if (!value) return "";
  return "*".repeat(Math.max(4, value.length - 4)) + (value.length > 4 ? value.slice(-4) : "");
}
