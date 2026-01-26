import { Settlement } from "@/features/dashboard/components/types";

export function downloadSettlementCsv(settlement: Settlement) {
    const rows = [
        ['Payment ID', 'Customer', 'Amount'],
        ...settlement.payments.map(p => [
            p.id,
            p.customer,
            p.amount.toString(),
        ]),
    ];

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settlement.id}.csv`;
    a.click();

    URL.revokeObjectURL(url);
}
