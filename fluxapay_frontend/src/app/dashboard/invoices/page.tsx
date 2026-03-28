"use client";

import { useState, useEffect, useCallback } from "react";
import { Invoice } from "@/features/dashboard/invoices/invoices-mock";
import { InvoicesTable } from "@/features/dashboard/invoices/InvoicesTable";
import { InvoiceDetails } from "@/features/dashboard/invoices/InvoiceDetails";
import { InvoiceForm } from "@/features/dashboard/invoices/InvoiceForm";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Plus } from "lucide-react";
import { Suspense } from "react";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";

const ALL_STATUSES = ["all", "unpaid", "pending", "paid", "overdue"];

function InvoicesContent() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [, setHasMore] = useState(true);

  const fetchInvoices = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.invoices.list({
        page,
        limit: 20,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      
      if (page === 1) {
        setInvoices(response.invoices || []);
      } else {
        setInvoices((prev) => [...prev, ...(response.invoices || [])]);
      }
      setHasMore(response.hasMore || false);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Failed to load invoices");
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const filteredInvoices = invoices.filter((invoice) => {
    if (!search) return true;
    return (
      invoice.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      invoice.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      invoice.customer_email?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleCreateInvoice = async (
    data: Omit<Invoice, "id" | "invoice_number" | "payment_link" | "created_at">
  ) => {
    try {
      await api.invoices.create({
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        line_items: data.line_items,
        currency: data.currency,
        due_date: data.due_date,
        notes: data.notes,
      });
      
      toast.success("Invoice created successfully!");
      setShowCreateModal(false);
      
      // Refresh the list
      setPage(1);
      fetchInvoices();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Failed to create invoice");
      }
    }
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
