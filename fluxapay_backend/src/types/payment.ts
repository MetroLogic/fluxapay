/**
 * Payment status enum values
 * These match the Prisma schema PaymentStatus enum
 */
export enum PaymentStatus {
  PENDING = 'pending',
  PARTIALLY_PAID = 'partially_paid',
  CONFIRMED = 'confirmed',
  OVERPAID = 'overpaid',
  EXPIRED = 'expired',
  FAILED = 'failed',
  PAID = 'paid',
  COMPLETED = 'completed',
}

/**
 * Type alias for PaymentStatus values (for compatibility with Prisma)
 */
export type PaymentStatusType = PaymentStatus;

/**
 * Helper function to check if a status is a valid payment status
 */
export function isValidPaymentStatus(status: string): status is PaymentStatus {
  return Object.values(PaymentStatus).includes(status as PaymentStatus);
}

/**
 * Helper function to get all payment statuses
 */
export function getAllPaymentStatuses(): PaymentStatus[] {
  return Object.values(PaymentStatus);
}

/**
 * Helper function to get terminal statuses (statuses that don't change)
 */
export function getTerminalPaymentStatuses(): PaymentStatus[] {
  return [
    PaymentStatus.EXPIRED,
    PaymentStatus.FAILED,
    PaymentStatus.PAID,
    PaymentStatus.COMPLETED,
  ];
}

/**
 * Helper function to get active statuses (statuses that can still change)
 */
export function getActivePaymentStatuses(): PaymentStatus[] {
  return [
    PaymentStatus.PENDING,
    PaymentStatus.PARTIALLY_PAID,
    PaymentStatus.CONFIRMED,
    PaymentStatus.OVERPAID,
  ];
}

/**
 * Helper function to check if a status is terminal
 */
export function isTerminalStatus(status: PaymentStatus): boolean {
  return getTerminalPaymentStatuses().includes(status);
}

/**
 * Helper function to check if a status is active
 */
export function isActiveStatus(status: PaymentStatus): boolean {
  return getActivePaymentStatuses().includes(status);
}

/**
 * Helper function to get statuses that allow refunds
 */
export function getRefundableStatuses(): PaymentStatus[] {
  return [
    PaymentStatus.CONFIRMED,
    PaymentStatus.OVERPAID,
    PaymentStatus.PAID,
    PaymentStatus.COMPLETED,
  ];
}

/**
 * Helper function to check if a status allows refunds
 */
export function isRefundableStatus(status: PaymentStatus): boolean {
  return getRefundableStatuses().includes(status);
}
