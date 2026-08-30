import { Settlement } from "@/features/dashboard/components/types";

/**
 * Escape a single CSV cell per RFC 4180:
 * - Double quotes are escaped as "" (doubled).
 * - Cells containing commas, double quotes, or newlines are wrapped in quotes.
 * - Leading CSV injection characters (=, +, -, @) are neutralized.
 * Always quote every cell so the output is uniformly parseable.
 */
export function escapeCsvCell(rawValue: string | number): string {
  let value = String(rawValue);

  // Neutralize CSV injection: a leading =, +, -, @, tab, or CR would otherwise
  // be interpreted as a formula by Excel/Sheets. Prefix with a tab or escape char.
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }

  if (/["\n\r,]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function downloadSettlementCsv(settlement: Settlement) {
    const headerSection = [
        ['FluxaPay Settlement Statement'],
        [''],
        ['Settlement ID', settlement.id],
        ['Date', new Date(settlement.date).toLocaleDateString()],
        ['Status', settlement.status],
        ['Currency', settlement.currency],
        ['Bank Reference', settlement.bankReference || 'N/A'],
        [''],
        ['FINANCIAL SUMMARY'],
        ['USDC Amount', settlement.usdcAmount.toFixed(2)],
        ['Conversion Rate', settlement.conversionRate.toString()],
        ['Gross Fiat Amount', settlement.fiatAmount.toFixed(2)],
        ['Fees', settlement.fees.toFixed(2)],
        ['Net Payout', (settlement.fiatAmount - settlement.fees).toFixed(2)],
        [''],
    ];

    const paymentSection = [
        ['INCLUDED PAYMENTS'],
        ['Payment ID', 'Customer', 'Amount (USDC)'],
        ...settlement.payments.map(p => [
            p.id,
            p.customer,
            p.amount.toFixed(2),
        ]),
        [''],
        ['Total Payments', settlement.paymentsCount.toString()],
        [''],
        ['Generated', new Date().toISOString()],
        ['', 'This is a computer-generated statement from FluxaPay.'],
    ];

    const allRows = [...headerSection, ...paymentSection];
    const csv = allRows
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settlement.id}-statement.csv`;
    a.click();

    URL.revokeObjectURL(url);
}
