import { Settlement } from "@/features/dashboard/components/types";

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
    const csv = allRows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settlement.id}-statement.csv`;
    a.click();

    URL.revokeObjectURL(url);
}
