"use client";

import { useState, useMemo } from "react";
import { MOCK_INVOICES, Invoice } from "@/features/dashboard/invoices/invoices-mock";
import { InvoicesTable } from "@/features/dashboard/invoices/InvoicesTable";
import { InvoiceDetails } from "@/features/dashboard/invoices/InvoiceDetails";
import { InvoiceForm } from "@/features/dashboard/invoices/InvoiceForm";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Plus } from "lucide-react";
import { Suspense } from "react";

const ALL_STATUSES = ["all", "unpaid", "pending", "paid", "overdue"];

function InvoicesContent() {
  const [invoices, setInvoices] = useState<Invoice[]>(MOCK_INVOICES);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const matchesSearch =
        invoice.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        invoice.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        invoice.customer_email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || invoice.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const handleCreateInvoice = (
    data: Omit<Invoice, "id" | "invoice_number" | "payment_link" | "created_at">
  ) => {
    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const random = Math.floor(1000 + Math.random() * 9000);
    const invoice_number = `INV-${yyyymmdd}-${random}`;
    const newInvoice: Invoice = {
      ...data,
      id: `inv_${Date.now()}`,
      invoice_number,
      payment_link: `${window.location.origin}/pay/invoice/${invoice_number}`,
      created_at: now.toISOString(),
    };
    setInvoices((prev) => [newInvoice, ...prev]);
    setShowCreateModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Invoices</h2>
          <p className="text-muted-foreground">
            Create and manage invoices with embedded payment links.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by invoice #, customer name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <InvoicesTable
          invoices={filteredInvoices}
          onRowClick={(invoice) => setSelectedInvoice(invoice)}
        />

        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredInvoices.length} of {invoices.length} invoices
        </div>
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title="Invoice Details"
      >
        {selectedInvoice && <InvoiceDetails invoice={selectedInvoice} />}
      </Modal>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Invoice"
      >
        <InvoiceForm
          onSubmit={handleCreateInvoice}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <InvoicesContent />
    </Suspense>
  );
}
