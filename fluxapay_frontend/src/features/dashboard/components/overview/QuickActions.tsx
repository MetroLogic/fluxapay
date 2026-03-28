"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Link, FileText, Download, Loader2 } from "lucide-react";
import { DOCS_URLS } from "@/lib/docs";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";

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
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadReport = async (format: "csv" | "pdf") => {
    if (!fromDate || !toDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    setIsDownloading(true);
    try {
      // Call backend API to export settlements
      const blob = await api.settlements.exportRange({
        date_from: fromDate,
        date_to: toDate,
        format,
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `settlement_report_${fromDate}_${toDate}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Settlement report downloaded as ${format.toUpperCase()}`);
      setIsReportModalOpen(false);
    } catch (error) {
      console.error("Error downloading settlement report:", error);
      toastApiError(error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCreatePaymentLink = () => {
    router.push("/dashboard/payments?action=create-payment-link");
  };

  const handleViewDocs = () => {
    // Open docs in new tab
    window.open(DOCS_URLS.FULL_DOCS, "_blank", "noopener,noreferrer");
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
            onClick={handleCreatePaymentLink}
          >
            <Link className="mr-2 h-4 w-4" />
            Create Payment Link
          </Button>
          <Button
            className="w-full justify-start h-12"
            variant="outline"
            onClick={handleViewDocs}
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
          <p className="text-sm text-muted-foreground">
            Select a date range to export your settlement data.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate}
                max={toIsoDate(today)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => handleDownloadReport("csv")}
              disabled={isDownloading || !fromDate || !toDate}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                "Download CSV"
              )}
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleDownloadReport("pdf")}
              disabled={isDownloading || !fromDate || !toDate}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                "Download PDF"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
