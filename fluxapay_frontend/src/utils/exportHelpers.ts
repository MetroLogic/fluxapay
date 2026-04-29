import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import { format } from 'date-fns';
import { ReconciliationRecord, ReconciliationPeriod } from '../types/reconciliation';

// jspdf-autotable extends the jsPDF instance but doesn't export this type
interface JsPDFWithAutoTable extends jsPDF {
    lastAutoTable: { finalY: number };
}

export async function exportToPDF(
    records: ReconciliationRecord[],
    summary: ReconciliationPeriod,
    merchantInfo: { name: string; id: string }
): Promise<void> {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(33, 33, 33);
    doc.text('FluxaPay Reconciliation Statement', 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Merchant: ${merchantInfo.name} (${merchantInfo.id})`, 14, 32);
    doc.text(`Period: ${format(summary.startDate, 'MMM d, yyyy')} - ${format(summary.endDate, 'MMM d, yyyy')}`, 14, 38);
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm:ss')}`, 14, 44);

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(33, 33, 33);
    doc.text('Summary', 14, 55);

    autoTable(doc, {
        startY: 60,
        head: [['Metric', 'Amount']],
        body: [
            ['Total USDC Received', `${summary.totalUSDCReceived.toFixed(2)} USDC`],
            ['Total Fiat Payout', `$${summary.totalFiatPayout.toFixed(2)}`],
            ['Total Fees', `$${summary.totalFees.toFixed(2)}`],
            ['Net Discrepancy', `$${summary.discrepancy.toFixed(2)}`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [63, 81, 181] },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    // Transactions Table
    doc.setFontSize(14);
    doc.text('Transactions', 14, (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 15);

    const tableData = records.map(record => [
        format(record.date, 'MMM d, yyyy HH:mm'),
        record.settlementId,
        `${record.usdcReceived.toFixed(2)}`,
        `$${record.fiatPayout.toFixed(2)}`,
        `$${record.fees.toFixed(2)}`,
        `$${record.discrepancy.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 20,
        head: [['Date', 'Settlement ID', 'USDC Received', 'Fiat Payout', 'Fees', 'Discrepancy']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [63, 81, 181] },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 5) {
                const valStr = data.cell.raw as string;
                const val = parseFloat(valStr.replace('$', ''));
                if (Math.abs(val) > 0.01) {
                    data.cell.styles.textColor = [220, 53, 69]; // Red for discrepancy
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        }
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(
            `Page ${i} of ${pageCount}`,
            doc.internal.pageSize.width / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
        );
    }

    doc.save(`fluxapay-reconciliation-${format(summary.startDate, 'yyyyMMdd')}-${format(summary.endDate, 'yyyyMMdd')}.pdf`);
}

export function exportSettlementReportPDF(report: {
    date_from?: string | null;
    date_to?: string | null;
    generated_at: string;
    merchant_name: string;
    settlements: Array<{
        id: string;
        status: string;
        amount: number;
        currency: string;
        fees: number;
        net_amount: number;
        scheduled_date: string | null;
        processed_date: string | null;
        created_at: string;
        bank_transfer_id: string | null;
    }>;
}, filename: string): void {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(33, 33, 33);
    doc.text('FluxaPay Settlement Report', 14, 20);

    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Merchant: ${report.merchant_name}`, 14, 30);
    doc.text(`Period: ${report.date_from ?? 'All'} - ${report.date_to ?? 'All'}`, 14, 36);
    doc.text(`Generated: ${format(new Date(report.generated_at), 'PPpp')}`, 14, 42);

    const tableBody = report.settlements.map((item) => [
        item.id,
        item.status,
        item.amount.toString(),
        item.currency,
        item.fees.toString(),
        item.net_amount.toString(),
        item.scheduled_date ?? 'N/A',
        item.processed_date ?? 'N/A',
        item.created_at.split('T')[0],
        item.bank_transfer_id ?? 'N/A',
    ]);

    autoTable(doc, {
        startY: 52,
        head: [[
            'Settlement ID',
            'Status',
            'Amount',
            'Currency',
            'Fees',
            'Net Amount',
            'Scheduled Date',
            'Processed Date',
            'Created At',
            'Bank Transfer ID',
        ]],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [63, 81, 181] },
        styles: { fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 20 },
            2: { cellWidth: 20 },
            3: { cellWidth: 18 },
            4: { cellWidth: 20 },
            5: { cellWidth: 22 },
            6: { cellWidth: 24 },
            7: { cellWidth: 24 },
            8: { cellWidth: 24 },
            9: { cellWidth: 38 },
        },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(
            `Page ${i} of ${pageCount}`,
            doc.internal.pageSize.width / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
        );
    }

    doc.save(filename);
}

export function exportToCSV(records: ReconciliationRecord[]): void {
