/**
 * Utility helper functions for managing invoices.
 */

/**
 * Formats an invoice number using the current year and a zero-padded index.
 * 
 * @param index The numeric index of the invoice
 * @returns The formatted invoice ID string (e.g., INV-2026-00042)
 */
export function formatInvoiceNumber(index: number): string {
  const year = new Date().getFullYear();
  const paddedIndex = String(index).padStart(5, '0');
  return `INV-${year}-${paddedIndex}`;
}
