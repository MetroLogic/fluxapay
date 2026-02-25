import { Invoice, InvoiceStatus } from "./invoices-mock";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Copy, ExternalLink, User, Receipt, Calendar, Download, Mail } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface InvoiceDetailsProps {
  invoice: Invoice;
}

const statusVariant: Record<InvoiceStatus, "success" | "warning" | "error" | "secondary"> = {
  paid: "success",
  pending: "warning",
  overdue: "error",
  unpaid: "secondary",
};

const statusLabel: Record<InvoiceStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  overdue: "Overdue",
  unpaid: "Unpaid",
};

export const InvoiceDetails = ({ invoice }: InvoiceDetailsProps) => {
  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(40);
    doc.text(`INVOICE`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${invoice.invoice_number}`, 14, 30);
    doc.text(`Status: ${statusLabel[invoice.status]}`, 14, 36);
    doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 14, 42);
    doc.text(`Due: ${new Date(invoice.due_date).toLocaleDateString()}`, 14, 48);
    
    // Customer Info
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text(`Billed To:`, 14, 62);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${invoice.customer_name}`, 14, 68);
    doc.text(`${invoice.customer_email}`, 14, 74);

    // Line items table
    const tableData = invoice.line_items.map((item) => [
      item.description,
      item.quantity.toString(),
      item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      (item.quantity * item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 }),
    ]);

    autoTable(doc, {
      startY: 85,
      head: [["Description", "Qty", "Unit Price", "Subtotal"]],
      body: tableData,
      foot: [["", "", "Total", `${invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${invoice.currency}`]],
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42] }, // tailwind slate-900
      styles: { fontSize: 10 },
    });
    
    // Footer details (Payment Info & Notes)
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 100;
    
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text(`Payment Link:`, 14, finalY + 15);
    doc.setTextColor(59, 130, 246); // tailwind blue-500
    doc.text(invoice.payment_link, 14, finalY + 21);
    
    if (invoice.notes) {
      doc.setTextColor(100);
      doc.text(`Notes:\n${invoice.notes}`, 14, finalY + 35);
    }

    doc.save(`${invoice.invoice_number}.pdf`);
  };

  const handleEmailInvoice = () => {
    const subject = encodeURIComponent(`Invoice ${invoice.invoice_number}`);
    const body = encodeURIComponent(
      `Hello ${invoice.customer_name},\n\n` +
      `Your invoice for ${invoice.total_amount.toLocaleString()} ${invoice.currency} is ready.\n\n` +
      `Status: ${statusLabel[invoice.status]}\n` +
      `Due Date: ${new Date(invoice.due_date).toLocaleDateString()}\n\n` +
      `You can view and pay securely via this link:\n${invoice.payment_link}\n\n` +
      `Thank you!`
    );
    window.location.href = `mailto:${invoice.customer_email}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider">
            Invoice Total
          </p>
          <h2 className="text-3xl font-bold uppercase">
            {invoice.total_amount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span className="text-xl text-muted-foreground">{invoice.currency}</span>
          </h2>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider">Status</p>
          <div className="scale-110 origin-right">
            <Badge variant={statusVariant[invoice.status]}>
              {statusLabel[invoice.status]}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Details */}
        <div className="space-y-4 p-5 rounded-2xl border bg-muted/20">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <User className="h-4 w-4" />
            <h3>Customer Details</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{invoice.customer_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{invoice.customer_email}</p>
            </div>
          </div>
        </div>

        {/* Invoice Info */}
        <div className="space-y-4 p-5 rounded-2xl border bg-muted/20">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Calendar className="h-4 w-4" />
            <h3>Invoice Info</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Invoice Number</p>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">
                {invoice.invoice_number}
              </code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="font-medium">
                {new Date(invoice.due_date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm text-muted-foreground">
                {new Date(invoice.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <Receipt className="h-4 w-4" />
          <h3>Line Items</h3>
        </div>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Description</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Unit Price</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.line_items.map((item, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">{item.description}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {item.unit_price.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {(item.quantity * item.unit_price).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td colSpan={3} className="px-4 py-2 font-semibold text-right">
                  Total
                </td>
                <td className="px-4 py-2 text-right font-bold tabular-nums">
                  {invoice.total_amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  {invoice.currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Notes</p>
          {invoice.notes}
        </div>
      )}

      {/* Payment Link */}
      <div className="space-y-2 border-t pt-5">
        <p className="text-sm font-medium">Payment Link</p>
        <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
          <code className="text-xs flex-1 truncate text-muted-foreground">
            {invoice.payment_link}
          </code>
          <button
            onClick={() => copyToClipboard(invoice.payment_link)}
            className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Copy link"
          >
            <Copy className="h-4 w-4" />
          </button>
          <a
            href={invoice.payment_link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-background rounded text-primary transition-colors"
            title="Open link"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="flex-1 gap-2"
          onClick={() => copyToClipboard(invoice.payment_link)}
        >
          <Copy className="h-4 w-4" />
          Copy Link
        </Button>
        <Button
          className="flex-1 gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80"
          onClick={handleEmailInvoice}
        >
          <Mail className="h-4 w-4" />
          Email Invoice
        </Button>
        <Button
          className="flex-1 gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80"
          onClick={handleDownloadPDF}
        >
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </div>
    </div>
  );
};
