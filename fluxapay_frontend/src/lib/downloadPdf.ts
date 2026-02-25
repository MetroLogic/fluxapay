import jsPDF from 'jspdf';
import { Settlement } from "@/features/dashboard/components/types";

export function downloadSettlementPdf(settlement: Settlement) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Colors
    const primaryColor: [number, number, number] = [15, 23, 42]; // slate-900
    const accentColor: [number, number, number] = [99, 102, 241]; // indigo-500
    const mutedColor: [number, number, number] = [100, 116, 139]; // slate-500
    const successColor: [number, number, number] = [16, 185, 129]; // emerald-500
    const dangerColor: [number, number, number] = [239, 68, 68]; // red-500

    // Header bar
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 36, 'F');

    // Logo area
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('FluxaPay', 14, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('SETTLEMENT STATEMENT', 14, 24);

    // Settlement ID on right
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(settlement.id, pageWidth - 14, 16, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 14, 24, { align: 'right' });

    let y = 48;

    // Summary section
    doc.setTextColor(...primaryColor);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Settlement Summary', 14, y);
    y += 2;

    // Divider
    doc.setDrawColor(...accentColor);
    doc.setLineWidth(0.8);
    doc.line(14, y, 80, y);
    y += 10;

    // Info grid
    const drawField = (label: string, value: string, x: number, yPos: number) => {
        doc.setTextColor(...mutedColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(label.toUpperCase(), x, yPos);

        doc.setTextColor(...primaryColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(value, x, yPos + 6);
    };

    drawField('Settlement Date', new Date(settlement.date).toLocaleDateString(), 14, y);
    drawField('Status', settlement.status.toUpperCase(), 80, y);
    drawField('Currency', settlement.currency, 140, y);
    y += 18;

    drawField('Total Payments', settlement.paymentsCount.toString(), 14, y);
    drawField('Bank Reference', settlement.bankReference || 'N/A', 80, y);
    drawField('Conversion Rate', settlement.conversionRate.toString(), 140, y);
    y += 22;

    // Financial breakdown
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, y, pageWidth - 28, 50, 3, 3, 'F');

    y += 10;
    doc.setTextColor(...mutedColor);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('FINANCIAL BREAKDOWN', 20, y);
    y += 10;

    const drawRow = (label: string, value: string, yPos: number, isBold: boolean = false, isDanger: boolean = false) => {
        doc.setTextColor(...mutedColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.text(label, 20, yPos);

        doc.setTextColor(isDanger ? dangerColor[0] : primaryColor[0], isDanger ? dangerColor[1] : primaryColor[1], isDanger ? dangerColor[2] : primaryColor[2]);
        doc.setFontSize(9);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.text(value, pageWidth - 20, yPos, { align: 'right' });
    };

    drawRow('USDC Amount', `$${settlement.usdcAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, y);
    y += 8;
    drawRow('Platform Fees', `-$${settlement.fees.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, y, false, true);
    y += 4;

    // Separator
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(20, y, pageWidth - 20, y);
    y += 6;

    const netAmount = settlement.fiatAmount - settlement.fees;
    drawRow(`Net Payout (${settlement.currency})`, `$${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, y, true);
    y += 16;

    // Payments table
    if (settlement.payments.length > 0) {
        doc.setTextColor(...primaryColor);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Included Payments', 14, y);
        y += 2;

        doc.setDrawColor(...accentColor);
        doc.setLineWidth(0.8);
        doc.line(14, y, 80, y);
        y += 8;

        // Table header
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y - 4, pageWidth - 28, 10, 'F');

        doc.setTextColor(...mutedColor);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('PAYMENT ID', 20, y + 2);
        doc.text('CUSTOMER', 70, y + 2);
        doc.text('AMOUNT', pageWidth - 20, y + 2, { align: 'right' });
        y += 12;

        // Table rows
        settlement.payments.forEach((p) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            doc.setTextColor(...primaryColor);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(p.id, 20, y);

            doc.setFont('helvetica', 'normal');
            doc.text(p.customer, 70, y);

            doc.setTextColor(...successColor);
            doc.setFont('helvetica', 'bold');
            doc.text(`$${p.amount.toFixed(2)}`, pageWidth - 20, y, { align: 'right' });

            // Row separator
            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.2);
            doc.line(14, y + 3, pageWidth - 14, y + 3);

            y += 8;
        });
    }

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, footerY - 5, pageWidth - 14, footerY - 5);

    doc.setTextColor(...mutedColor);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer-generated settlement statement from FluxaPay.', 14, footerY);
    doc.text('For queries, contact support@fluxapay.com', 14, footerY + 4);
    doc.text(`Page 1 of 1`, pageWidth - 14, footerY, { align: 'right' });

    doc.save(`${settlement.id}.pdf`);
}
