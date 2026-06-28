"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Invoice, InvoiceStatus } from "@/features/dashboard/invoices/invoices-mock";
import { InvoicesTable } from "@/features/dashboard/invoices/InvoicesTable";
import { InvoiceDetails } from "@/features/dashboard/invoices/InvoiceDetails";
import { InvoiceForm } from "@/features/dashboard/invoices/InvoiceForm";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import { DataTableCard, ListPageFilterBar, TablePaginationBar } from "@/components/data-table";
import Input from "@/components/Input";

const PAGE_SIZE = 20;
const ALL_STATUSES = ["all", "pending", "paid", "cancelled", "overdue"] as const;

function mapBackendInvoice(row: Record<string, unknown>): Invoice {
  const st = String(row.status ?? "");
  const status: InvoiceStatus =
    st === "cancelled"
      ? "cancelled"
      : st === "overdue"
        ? "overdue"
        : st === "paid"
          ? "paid"
          : st === "pending"
            ? "pending"
            : "unpaid";
  return {
    id: String(row.id),
    invoice_number: String(row.invoice_number),
    customer_name: "",
    customer_email: String(row.customer_email),
    line_items: [],
    total_amount: Number(row.amount),
    currency: String(row.currency),
    due_date: row.due_date
      ? new Date(String(row.due_date)).toISOString()
      : new Date(0).toISOString(),
    status,
    payment_link: String(row.payment_link ?? ""),
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function InvoicesContent() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { invoices: rows, meta } = await api.invoices.list({
        page,
        limit: PAGE_SIZE,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: debouncedSearch.trim() || undefined,
      });
      setTotal(meta.total);
      setInvoices(
        (rows as Record<string, unknown>[]).map((r) => mapBackendInvoice(r)),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setLoadError(err.message);
        toast.error(err.message);
      } else {
        const msg = "Failed to load invoices";
        setLoadError(msg);
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleCreateInvoice = async (
    data: Omit<Invoice, "id" | "invoice_number" | "payment_link" | "created_at">,
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

      <DataTableCard
        toolbar={
          <ListPageFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Input
                placeholder="Search by invoice # or email…"
                className="w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </ListPageFilterBar>
        }
        footer={
          <TablePaginationBar
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            loading={isLoading}
            onPageChange={setPage}
          />
        }
      >
        <InvoicesTable
          isLoading={isLoading}
          error={loadError}
          invoices={invoices}
          onRowClick={(invoice) => setSelectedInvoice(invoice)}
        />
      </DataTableCard>

      <Modal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title="Invoice Details"
      >
        {selectedInvoice && <InvoiceDetails invoice={selectedInvoice} />}
      </Modal>

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
