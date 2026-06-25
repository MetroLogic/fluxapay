/**
 * Formats a single settlement and its payments to CSV string.
 */
export function generateSettlementCSV(settlement: any, payments: any[]): string {
    const headerRows = [
        `Settlement Report - ${settlement.id}`,
        `Merchant: ${settlement.merchant.business_name}`,
        `Date: ${settlement.created_at.toISOString().split('T')[0]}`,
        `Status: ${settlement.status}`,
        ``,
        `SETTLEMENT SUMMARY`,
        `USDC Received,${Number(settlement.usdc_amount).toFixed(2)},USDC`,
        `Exchange Rate,${Number(settlement.exchange_rate || 1).toFixed(4)},${settlement.currency}`,
        `Gross Fiat Amount,${Number(settlement.amount).toFixed(2)},${settlement.currency}`,
        `Fees,${Number(settlement.fees).toFixed(2)},${settlement.currency}`,
        `Net Amount,${Number(settlement.net_amount).toFixed(2)},${settlement.currency}`,
        `Bank Transfer ID,${settlement.bank_transfer_id || 'N/A'}`,
        `Scheduled Date,${settlement.scheduled_date.toISOString().split('T')[0]}`,
        `Processed Date,${settlement.processed_date ? settlement.processed_date.toISOString().split('T')[0] : 'Pending'}`,
        ``,
        `INCLUDED PAYMENTS`,
        `Payment ID,Amount,Currency,Customer Email,Date,Status`,
    ];

    const paymentRows = payments.map((p) => {
        const dateStr = p.confirmed_at ? p.confirmed_at.toISOString().split('T')[0] : p.createdAt.toISOString().split('T')[0];
        // Clean customer email of commas to prevent CSV breakage
        const cleanEmail = p.customer_email.replace(/,/g, ' ');
        return `${p.id},${Number(p.amount).toFixed(2)},${p.currency},${cleanEmail},${dateStr},${p.status}`;
    });

    return [...headerRows, ...paymentRows].join('\n');
}

/**
 * Formats a range of settlement summaries to CSV string.
 */
export function generateSettlementsRangeCSV(settlements: any[]): string {
    const headerRows = [
        `FluxaPay Reconciliation Range Report`,
        `Generated:,${new Date().toISOString()}`,
        ``,
        `Date,Settlement ID,USDC Swept,Fiat Payout,Fees,Discrepancy,Currency,Status`,
    ];

    const recordRows = settlements.map((s) => {
        const dateStr = s.created_at.toISOString().split('T')[0];
        const discrepancy = Number(s.usdc_amount) - (Number(s.net_amount) + Number(s.fees));
        const status = Math.abs(discrepancy) > 0.01 ? 'Discrepancy' : 'Balanced';
        return `${dateStr},${s.id},${Number(s.usdc_amount).toFixed(2)},${Number(s.net_amount).toFixed(2)},${Number(s.fees).toFixed(2)},${discrepancy.toFixed(2)},${s.currency},${status}`;
    });

    return [...headerRows, ...recordRows].join('\n');
}
