export type PaymentStatusRecord = { status: string; createdAt: number };

// Module-level singleton so polling + SSE share state in dev/mock mode.
export const paymentStatusStore = new Map<string, PaymentStatusRecord>();

