/**
 * Shared validation helpers for monetary amounts.
 *
 * Ensures amounts (payment amounts, invoice amounts, line item quantities
 * and unit prices) are finite, positive numbers within a sane upper bound
 * before they are persisted or used in downstream calculations (e.g. USDC
 * conversion, settlement). Prevents negative/zero/NaN values from silently
 * flowing through as inverted balances.
 */

/** Upper bound for any single monetary amount, in the currency's major unit. */
export const MAX_AMOUNT = 1_000_000_000;

export class AmountValidationError extends Error {
  public readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "AmountValidationError";
  }
}

/**
 * Returns true only for finite numbers strictly greater than zero and at
 * most MAX_AMOUNT. Rejects strings, NaN, Infinity, null/undefined, and
 * non-positive values.
 */
export function isValidPositiveAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_AMOUNT
  );
}

/**
 * Throws AmountValidationError with a descriptive message if `value` is not
 * a valid positive amount. `label` is used to identify the offending field
 * in the error message (e.g. "amount", "line_items[0].unit_price").
 */
export function assertValidPositiveAmount(value: unknown, label = "amount"): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AmountValidationError(`${label} must be a valid number`);
  }
  if (value <= 0) {
    throw new AmountValidationError(`${label} must be greater than 0`);
  }
  if (value > MAX_AMOUNT) {
    throw new AmountValidationError(`${label} exceeds the maximum allowed value of ${MAX_AMOUNT}`);
  }
}

/**
 * Validates an array of invoice line items, checking that quantity and
 * unit_price are positive numbers. Throws AmountValidationError on the
 * first invalid item found, identifying it by index.
 */
export function assertValidLineItems(
  lineItems: Array<{ quantity: unknown; unit_price: unknown }> | undefined,
): void {
  if (!lineItems) return;
  lineItems.forEach((item, index) => {
    assertValidPositiveAmount(item.quantity, `line_items[${index}].quantity`);
    assertValidPositiveAmount(item.unit_price, `line_items[${index}].unit_price`);
  });
}
