"use client";

import { useState } from "react";
import { DollarSign, TrendingUp, Clock, Calendar } from "lucide-react";

import { DataTableCard } from "@/components/data-table";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { StatCard } from "./StatCard";
import { SettlementFilters } from "./SettlementFilters";
import { SettlementsTable } from "./SettlementsTable";
import { SettlementDetailsModal } from "./SettlementDetailsModal";
import {
  useSettlements,
  useSettlementSummary,
} from "@/hooks/useSettlements";

const PAGE_SIZE = 10;

export default function SettlementsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [date, setDate] = useState({ from: "", to: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { settlements, pagination, isLoading, error } = useSettlements({
    page,
    limit: PAGE_SIZE,
    status: status !== "all" ? status : undefined,
    currency: currency !== "all" ? currency : undefined,
    date_from: date.from || undefined,
    date_to: date.to || undefined,
  });

  const { summary, isLoading: summaryLoading } = useSettlementSummary();

  const avgDays = summary?.average_settlement_time_days ?? "—";
  const nextDate = summary?.next_settlement_date
    ? new Date(summary.next_settlement_date).toLocaleDateString()
    : "—";

  const totalSettled = summary?.total_settled_this_month ?? 0;
  const totalFees = summary?.total_fees_paid ?? 0;

  // Reset to page 1 when filters change
  const handleStatusChange = (v: string) => { setStatus(v); setPage(1); };
  const handleCurrencyChange = (v: string) => { setCurrency(v); setPage(1); };
  const handleDateChange = (v: { from: string; to: string }) => { setDate(v); setPage(1); };

  return (
    <div className="space-y-6 p-6">
      <header>
        <h2 className="text-2xl font-bold">Settlements</h2>
        <p className="text-muted-foreground">
          View your settlement history and payouts.
        </p>
      </header>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Settled"
          value={summaryLoading ? "…" : `$${Number(totalSettled).toLocaleString()}`}
          icon={DollarSign}
        />
        <StatCard
          title="Total Fees"
          value={summaryLoading ? "…" : `$${Number(totalFees).toLocaleString()}`}
          icon={TrendingUp}
        />
        <StatCard
          title="Avg. Settlement Time"
          value={summaryLoading ? "…" : `${avgDays} days`}
          icon={Clock}
        />
        <StatCard
          title="Next Settlement"
          value={summaryLoading ? "…" : nextDate}
          icon={Calendar}
        />
      </div>

      <DataTableCard
        toolbar={
          <SettlementFilters
            status={status}
            currency={currency}
            date={date}
            onStatusChange={handleStatusChange}
            onCurrencyChange={handleCurrencyChange}
            onDateChange={handleDateChange}
          />
        }
      >
        <SettlementsTable
          settlements={settlements}
          onSelect={(s) => setSelectedId(s.id)}
          isLoading={isLoading}
          error={error ? String(error) : null}
        />

        {pagination && (
          <TablePaginationBar
            page={page}
            pageSize={PAGE_SIZE}
            total={pagination.total}
            loading={isLoading}
            onPageChange={setPage}
          />
        )}
      </DataTableCard>

      {/* Detail Modal */}
      {selectedId && (
        <SettlementDetailsModal
          settlementId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
