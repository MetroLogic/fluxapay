import PDFDocument from 'pdfkit';

/**
 * Helper to generate a PDF document for a single settlement.
 */
export function generateSettlementPDF(settlement: any, payments: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers: Buffer[] = [];
            
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', err => reject(err));

            // Header - fluxapay branding
            doc.fillColor('#3F51B5').fontSize(22).text('FluxaPay Settlement Report', { align: 'left' });
            doc.fillColor('#666666').fontSize(10).text(`Generated on ${new Date().toLocaleString()}`, { align: 'left' });
            doc.moveDown(1.5);

            // Divider line
            doc.strokeColor('#E0E0E0').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(1.5);

            // Main info grid layout
            const startY = doc.y;
            doc.fillColor('#333333').fontSize(12);
            
            // Left Column
            doc.text(`Settlement ID:`, 50, startY);
            doc.font('Helvetica-Bold').text(`${settlement.id}`, 160, startY);
            doc.font('Helvetica');
            
            doc.text(`Merchant Name:`, 50, startY + 20);
            doc.text(`${settlement.merchant.business_name}`, 160, startY + 20);
            
            doc.text(`Status:`, 50, startY + 40);
            const statusColor = settlement.status === 'completed' ? '#2E7D32' : '#C62828';
            doc.fillColor(statusColor).font('Helvetica-Bold').text(`${settlement.status.toUpperCase()}`, 160, startY + 40);
            doc.fillColor('#333333').font('Helvetica');

            // Right Column
            doc.text(`Scheduled Date:`, 320, startY);
            doc.text(`${settlement.scheduled_date.toISOString().split('T')[0]}`, 430, startY);

            doc.text(`Processed Date:`, 320, startY + 20);
            doc.text(`${settlement.processed_date ? settlement.processed_date.toISOString().split('T')[0] : 'Pending'}`, 430, startY + 20);

            doc.text(`Payout Ref:`, 320, startY + 40);
            doc.text(`${settlement.bank_transfer_id || 'N/A'}`, 430, startY + 40);

            doc.moveDown(3);

            // Summary Section
            doc.fillColor('#3F51B5').fontSize(14).font('Helvetica-Bold').text('Settlement Summary');
            doc.moveDown(0.5);
            
            let summaryY = doc.y;
            // Draw a light grey background box for summary
            doc.rect(50, summaryY, 500, 90).fill('#F5F5F5');
            
            doc.fillColor('#333333').fontSize(11).font('Helvetica');
            doc.text(`Total USDC Received:`, 70, summaryY + 15);
            doc.font('Helvetica-Bold').text(`${Number(settlement.usdc_amount).toFixed(2)} USDC`, 220, summaryY + 15);
            
            doc.font('Helvetica').text(`Exchange Rate:`, 70, summaryY + 35);
            doc.text(`1 USDC = ${Number(settlement.exchange_rate || 1).toFixed(4)} ${settlement.currency}`, 220, summaryY + 35);

            doc.text(`Gross Fiat Amount:`, 70, summaryY + 55);
            doc.text(`${Number(settlement.amount).toFixed(2)} ${settlement.currency}`, 220, summaryY + 55);
            
            // Right half of summary box
            doc.font('Helvetica').text(`FluxaPay Fees:`, 320, summaryY + 15);
            doc.text(`${Number(settlement.fees).toFixed(2)} ${settlement.currency}`, 430, summaryY + 15);

            doc.font('Helvetica-Bold').text(`Net Payout Amount:`, 320, summaryY + 35);
            doc.fillColor('#3F51B5').text(`${Number(settlement.net_amount).toFixed(2)} ${settlement.currency}`, 430, summaryY + 35);
            doc.fillColor('#333333');

            doc.moveDown(6);

            // Payments List Section
            doc.fillColor('#3F51B5').fontSize(14).font('Helvetica-Bold').text('Included Stellar Payments');
            doc.moveDown(0.5);

            // Table Header
            let tableY = doc.y;
            doc.strokeColor('#3F51B5').lineWidth(1.5).moveTo(50, tableY).lineTo(550, tableY).stroke();
            doc.fillColor('#3F51B5').fontSize(9).font('Helvetica-Bold');
            doc.text('Payment ID', 55, tableY + 6);
            doc.text('Customer Email', 180, tableY + 6);
            doc.text('Asset / Cur', 350, tableY + 6);
            doc.text('Gross Amount', 420, tableY + 6);
            doc.text('Confirmed At', 485, tableY + 6);
            
            doc.strokeColor('#E0E0E0').lineWidth(1).moveTo(50, tableY + 20).lineTo(550, tableY + 20).stroke();
            tableY += 20;

            // Table rows
            doc.fillColor('#333333').font('Helvetica');
            for (const p of payments) {
                if (tableY > 700) {
                    doc.addPage();
                    tableY = 50;
                    
                    // Repeat headers on new page
                    doc.strokeColor('#3F51B5').lineWidth(1.5).moveTo(50, tableY).lineTo(550, tableY).stroke();
                    doc.fillColor('#3F51B5').fontSize(9).font('Helvetica-Bold');
                    doc.text('Payment ID', 55, tableY + 6);
                    doc.text('Customer Email', 180, tableY + 6);
                    doc.text('Asset / Cur', 350, tableY + 6);
                    doc.text('Gross Amount', 420, tableY + 6);
                    doc.text('Confirmed At', 485, tableY + 6);
                    doc.strokeColor('#E0E0E0').lineWidth(1).moveTo(50, tableY + 20).lineTo(550, tableY + 20).stroke();
                    tableY += 20;
                    doc.fillColor('#333333').font('Helvetica');
                }

                const emailStr = p.customer_email.length > 25 ? p.customer_email.slice(0, 23) + '...' : p.customer_email;
                const dateStr = p.confirmed_at ? p.confirmed_at.toISOString().split('T')[0] : p.createdAt.toISOString().split('T')[0];

                doc.fontSize(8);
                doc.text(p.id, 55, tableY + 6);
                doc.text(emailStr, 180, tableY + 6);
                doc.text(`${p.currency}`, 350, tableY + 6);
                doc.text(`${Number(p.amount).toFixed(2)}`, 420, tableY + 6);
                doc.text(dateStr, 485, tableY + 6);

                doc.strokeColor('#E8E8E8').lineWidth(0.5).moveTo(50, tableY + 18).lineTo(550, tableY + 18).stroke();
                tableY += 18;
            }

            // Footer pagination (simple page numbering on end)
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).fillColor('#999999').text(
                    `Page ${i + 1} of ${range.count} | FluxaPay Secure Settlement Service`,
                    50,
                    750,
                    { align: 'center', width: 500 }
                );
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Helper to generate a summary reconciliation report for a date range.
 */
export function generateSettlementsRangePDF(
    merchantName: string,
    settlements: any[],
    filters: { date_from?: string; date_to?: string; asset: string; min_discrepancy: number }
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers: Buffer[] = [];

            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', err => reject(err));

            // Header - fluxapay branding
            doc.fillColor('#3F51B5').fontSize(22).text('Reconciliation Range Report', { align: 'left' });
            doc.fillColor('#666666').fontSize(10).text(`Generated on ${new Date().toLocaleString()}`, { align: 'left' });
            doc.moveDown(1.5);

            // Divider line
            doc.strokeColor('#E0E0E0').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(1.5);

            // Filters Summary
            const startY = doc.y;
            doc.fillColor('#333333').fontSize(11);
            doc.text(`Merchant:`, 50, startY);
            doc.font('Helvetica-Bold').text(`${merchantName}`, 160, startY);
            doc.font('Helvetica');

            doc.text(`Reporting Period:`, 50, startY + 18);
            const periodStr = `${filters.date_from ? filters.date_from.split('T')[0] : 'Beginning'} to ${filters.date_to ? filters.date_to.split('T')[0] : 'Present'}`;
            doc.text(periodStr, 160, startY + 18);

            doc.text(`Asset Class:`, 50, startY + 36);
            doc.text(filters.asset.toUpperCase(), 160, startY + 36);

            doc.text(`Min Discrepancy:`, 320, startY);
            doc.text(`$${filters.min_discrepancy.toFixed(2)}`, 430, startY);

            doc.text(`Records Found:`, 320, startY + 18);
            doc.text(`${settlements.length}`, 430, startY + 18);

            doc.moveDown(4.5);

            // Aggregate metrics calculations
            let totalUSDC = 0;
            let totalFiat = 0;
            let totalFees = 0;
            let totalDiscrepancy = 0;

            for (const s of settlements) {
                const discrepancy = Number(s.usdc_amount) - (Number(s.net_amount) + Number(s.fees));
                totalUSDC += Number(s.usdc_amount);
                totalFiat += Number(s.net_amount);
                totalFees += Number(s.fees);
                totalDiscrepancy += discrepancy;
            }

            // Summary Statistics Section
            doc.fillColor('#3F51B5').fontSize(14).font('Helvetica-Bold').text('Reconciliation Statistics');
            doc.moveDown(0.5);

            let summaryY = doc.y;
            doc.rect(50, summaryY, 500, 70).fill('#F5F5F5');

            doc.fillColor('#333333').fontSize(11).font('Helvetica');
            doc.text(`Total USDC Swept:`, 70, summaryY + 15);
            doc.font('Helvetica-Bold').text(`${totalUSDC.toFixed(2)} USDC`, 220, summaryY + 15);

            doc.font('Helvetica').text(`Total Fiat Payouts:`, 70, summaryY + 38);
            doc.text(`$${totalFiat.toFixed(2)}`, 220, summaryY + 38);

            doc.text(`Total Fees Paid:`, 320, summaryY + 15);
            doc.text(`$${totalFees.toFixed(2)}`, 430, summaryY + 15);

            doc.font('Helvetica-Bold').text(`Net Discrepancy:`, 320, summaryY + 38);
            const discrepancyColor = Math.abs(totalDiscrepancy) > 0.01 ? '#C62828' : '#2E7D32';
            doc.fillColor(discrepancyColor).text(`$${totalDiscrepancy.toFixed(2)}`, 430, summaryY + 38);
            doc.fillColor('#333333');

            doc.moveDown(5.5);

            // Records Table
            doc.fillColor('#3F51B5').fontSize(14).font('Helvetica-Bold').text('Settlement History & Discrepancies');
            doc.moveDown(0.5);

            // Table Header
            let tableY = doc.y;
            doc.strokeColor('#3F51B5').lineWidth(1.5).moveTo(50, tableY).lineTo(550, tableY).stroke();
            doc.fillColor('#3F51B5').fontSize(9).font('Helvetica-Bold');
            doc.text('Date', 55, tableY + 6);
            doc.text('Settlement ID', 135, tableY + 6);
            doc.text('USDC Swept', 260, tableY + 6);
            doc.text('Fiat Payout', 335, tableY + 6);
            doc.text('Fees', 415, tableY + 6);
            doc.text('Discrepancy', 480, tableY + 6);

            doc.strokeColor('#E0E0E0').lineWidth(1).moveTo(50, tableY + 20).lineTo(550, tableY + 20).stroke();
            tableY += 20;

            // Table body
            doc.fillColor('#333333').font('Helvetica');
            for (const s of settlements) {
                if (tableY > 700) {
                    doc.addPage();
                    tableY = 50;

                    // Repeat headers on new page
                    doc.strokeColor('#3F51B5').lineWidth(1.5).moveTo(50, tableY).lineTo(550, tableY).stroke();
                    doc.fillColor('#3F51B5').fontSize(9).font('Helvetica-Bold');
                    doc.text('Date', 55, tableY + 6);
                    doc.text('Settlement ID', 135, tableY + 6);
                    doc.text('USDC Swept', 260, tableY + 6);
                    doc.text('Fiat Payout', 335, tableY + 6);
                    doc.text('Fees', 415, tableY + 6);
                    doc.text('Discrepancy', 480, tableY + 6);
                    doc.strokeColor('#E0E0E0').lineWidth(1).moveTo(50, tableY + 20).lineTo(550, tableY + 20).stroke();
                    tableY += 20;
                    doc.fillColor('#333333').font('Helvetica');
                }

                const dateStr = s.created_at.toISOString().split('T')[0];
                const discrepancy = Number(s.usdc_amount) - (Number(s.net_amount) + Number(s.fees));

                doc.fontSize(8);
                doc.text(dateStr, 55, tableY + 6);
                doc.text(s.id, 135, tableY + 6);
                doc.text(`${Number(s.usdc_amount).toFixed(2)}`, 260, tableY + 6);
                doc.text(`${Number(s.net_amount).toFixed(2)}`, 335, tableY + 6);
                doc.text(`${Number(s.fees).toFixed(2)}`, 415, tableY + 6);

                if (Math.abs(discrepancy) > 0.01) {
                    doc.fillColor('#cc0000').font('Helvetica-Bold');
                } else {
                    doc.fillColor('#2E7D32');
                }
                doc.text(`$${discrepancy.toFixed(2)}`, 480, tableY + 6);
                doc.fillColor('#333333').font('Helvetica');

                doc.strokeColor('#E8E8E8').lineWidth(0.5).moveTo(50, tableY + 18).lineTo(550, tableY + 18).stroke();
                tableY += 18;
            }

            // Page numbering
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).fillColor('#999999').text(
                    `Page ${i + 1} of ${range.count} | FluxaPay Reconciliation Statement Engine`,
                    50,
                    750,
                    { align: 'center', width: 500 }
                );
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
