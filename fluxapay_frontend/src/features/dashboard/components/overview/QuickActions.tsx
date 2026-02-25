"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Link, FileText, Download } from "lucide-react";
import { DOCS_URLS } from "@/lib/docs";
import { MOCK_SETTLEMENTS } from "../settlements/mockSettlements";

function toIsoDate(value: Date) {
  return value.toISOString().split("T")[0];
}

export const QuickActions = () => {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d;
  }, [today]);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(toIsoDate(thirtyDaysAgo));
  const [toDate, setToDate] = useState(toIsoDate(today));

  const filteredSettlements = useMemo(() => {
    return MOCK_SETTLEMENTS.filter((settlement) => {
      if (fromDate && settlement.date < fromDate) return false;
      if (toDate && settlement.date > toDate) return false;
      return true;
    });
  }, [fromDate, toDate]);

  const downloadReportCsv = () => {
    if (filteredSettlements.length === 0) return;

    const headers = [
      "Settlement ID",
      "Date",
      "Status",
      "Payments",
      "Fiat Amount",
      "Currency",
      "Fees",
    ];
    const rows = filteredSettlements.map((s) => [
      s.id,
      s.date,
      s.status,
      String(s.paymentsCount),
      String(s.fiatAmount),
      s.currency,
      String(s.fees),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `settlement_report_${fromDate || "start"}_${toDate || "end"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadReportPdf = () => {
    if (filteredSettlements.length === 0) return;

    const doc = new jsPDF();
    doc.text("Settlement Report", 14, 14);
    doc.text(`Period: ${fromDate || "Start"} - ${toDate || "End"}`, 14, 22);

    let y = 34;
    filteredSettlements.forEach((s) => {
      doc.text(
        `${s.id} | ${s.date} | ${s.status} | ${s.currency} ${s.fiatAmount}`,
        14,
        y,
      );
      y += 8;
      if (y > 280) {
        doc.addPage();
        y = 14;
      }
    });

    doc.save(`settlement_report_${fromDate || "start"}_${toDate || "end"}.pdf`);
  };

  const handleDownloadReport = (format: "csv" | "pdf") => {
    if (format === "csv") downloadReportCsv();
    if (format === "pdf") downloadReportPdf();
    setIsReportModalOpen(false);
  };

  return (
    <>
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm h-full col-span-1 lg:col-span-3">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-semibold leading-none tracking-tight">
            Quick Actions
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Succinct shortcuts for common tasks.
          </p>
        </div>
        <div className="p-6 grid gap-4">
          <Button
            className="w-full justify-start h-12"
            variant="default"
            onClick={() => router.push("/dashboard/payments?action=create-payment-link")}
          >
            <Link className="mr-2 h-4 w-4" />
            Create Payment Link
          </Button>
          <Button
            className="w-full justify-start h-12"
            variant="outline"
            onClick={() => router.push(DOCS_URLS.FULL_DOCS)}
          >
            <FileText className="mr-2 h-4 w-4" />
            View API Documentation
          </Button>
          <Button
            className="w-full justify-start h-12"
            variant="outline"
            onClick={() => setIsReportModalOpen(true)}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Settlement Report
          </Button>
        </div>
      </div>

      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title="Download Settlement Report"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {filteredSettlements.length} settlements in selected period.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => handleDownloadReport("csv")}
              disabled={filteredSettlements.length === 0}
            >
              Download CSV
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleDownloadReport("pdf")}
              disabled={filteredSettlements.length === 0}
            >
              Download PDF
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
