import jsPDF from 'jspdf';
import { Settlement } from "@/features/dashboard/components/types";

export function downloadSettlementPdf(settlement: Settlement) {
    const doc = new jsPDF();

    doc.text(`Settlement ${settlement.id}`, 10, 10);
    doc.text(`Date: ${settlement.date}`, 10, 20);
    doc.text(`Total: $${settlement.fiatAmount}`, 10, 30);

    let y = 50;
    settlement.payments.forEach(p => {
        doc.text(`${p.id} - ${p.customer} - $${p.amount}`, 10, y);
        y += 8;
    });

    doc.save(`${settlement.id}.pdf`);
}
