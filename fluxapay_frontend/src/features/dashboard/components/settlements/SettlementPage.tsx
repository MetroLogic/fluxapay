"use client";

import { useState } from "react";
import { DollarSign, TrendingUp, Clock, Calendar } from "lucide-react";

import { StatCard } from "./StatCard";
import { SettlementFilters } from "./SettlementFilters";
import { SettlementsTable } from "./SettlementsTable";
import { SettlementDetailsModal } from "./SettlementDetailsModal";
import {
  useSettlements,
  useSettlementSummary,
  type MerchantSettlement,
} from "@/hooks/useSettlements";
import { MOCK_SETTLEMENTS } from "./mockSettlements";

export default function SettlementsPage() {
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [date, setDate] = useState({ from: "", to: "" });
  const [selected, setSelected] = useState<MerchantSettlement | null>(null);

  const { isLoading } = useSettlements({
    status: status !== "all" ? status : undefined,
    currency: currency !== "all" ? currency : undefined,
    date_from: date.from || undefined,
    date_to: date.to || undefined,
    limit: 100,
  });
  const { summary } = useSettlementSummary();

  const avgDays = summary?.average_settlement_time_days ?? "—";
  const nextDate = summary?.next_settlement_date ?? "—";

  const filtered = MOCK_SETTLEMENTS.filter((s) => {
    if (status !== "all" && s.status !== status) return false;
    if (currency !== "all" && s.currency !== currency) return false;
    if (date.from && s.date < date.from) return false;
    if (date.to && s.date > date.to) return false;
    return true;
  });

  const totalSettled = MOCK_SETTLEMENTS.filter(
    (s) => s.status === "completed",
  ).reduce((sum, s) => sum + s.fiatAmount, 0);

  const totalFees = MOCK_SETTLEMENTS.filter(
    (s) => s.status === "completed",
  ).reduce((sum, s) => sum + s.fees, 0);

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
          value={isLoading ? "…" : `$${Number(totalSettled).toLocaleString()}`}
          icon={DollarSign}
        />
        <StatCard
          title="Total Fees"
          value={isLoading ? "…" : `$${Number(totalFees).toLocaleString()}`}
          icon={TrendingUp}
        />
        <StatCard
          title="Avg. Settlement Time"
          value={isLoading ? "…" : `${avgDays} days`}
          icon={Clock}
        />
        <StatCard
          title="Next Settlement"
          value={isLoading ? "…" : nextDate}
          icon={Calendar}
        />
      </div>

      {/* Filters */}
      <SettlementFilters
        status={status}
        currency={currency}
        date={date}
        onStatusChange={setStatus}
        onCurrencyChange={setCurrency}
        onDateChange={setDate}
      />

      {/* Table */}
      <SettlementsTable settlements={filtered} onSelect={setSelected} />

      {/* Modal */}
      {selected && (
        <SettlementDetailsModal
          settlement={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
