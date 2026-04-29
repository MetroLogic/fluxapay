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
import { exportSettlementReportPDF } from "@/utils/exportHelpers";

const WEBHOOK_EVENT_TYPES = [
  "all",
  "payment_completed",
  "payment_confirmed",
  "payment_failed",
  "payment_pending",
  "refund_completed",
  "refund_failed",
  "subscription_created",
  "subscription_cancelled",
  "subscription_renewed",
] as const;

const WEBHOOK_STATUSES = ["all", "pending", "delivered", "failed", "retrying"] as const;

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
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(toIsoDate(thirtyDaysAgo));
  const [toDate, setToDate] = useState(toIsoDate(today));
  const [paymentFromDate, setPaymentFromDate] = useState(toIsoDate(thirtyDaysAgo));
  const [paymentToDate, setPaymentToDate] = useState(toIsoDate(today));
  const [webhookFromDate, setWebhookFromDate] = useState(toIsoDate(thirtyDaysAgo));
  const [webhookToDate, setWebhookToDate] = useState(toIsoDate(today));
  const [webhookEventType, setWebhookEventType] = useState<string>("all");
  const [webhookStatus, setWebhookStatus] = useState<string>("all");
  const [webhookSearch, setWebhookSearch] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingPayments, setIsDownloadingPayments] = useState(false);
  const [isDownloadingWebhooks, setIsDownloadingWebhooks] = useState(false);

  const handleDownloadReport = async (format: "csv" | "pdf") => {
    if (!fromDate || !toDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    setIsDownloading(true);
    try {
      const result = await api.settlements.exportRange({
        date_from: fromDate,
        date_to: toDate,
        format,
      });

      if (format === "pdf") {
        exportSettlementReportPDF(result.content, `settlement_report_${fromDate}_${toDate}.pdf`);
      } else {
        const blob = result as Blob;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `settlement_report_${fromDate}_${toDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      toast.success(`Settlement report downloaded as ${format.toUpperCase()}`);
      setIsReportModalOpen(false);
    } catch (error) {
      console.error("Error downloading settlement report:", error);
      toastApiError(error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExportPayments = async () => {
    if (!paymentFromDate || !paymentToDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    setIsDownloadingPayments(true);
    try {
      const blob = await api.payments.export({
        date_from: paymentFromDate,
        date_to: paymentToDate,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payments_export_${paymentFromDate}_${paymentToDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Payment export downloaded successfully");
      setIsPaymentModalOpen(false);
    } catch (error) {
      console.error("Error exporting payments:", error);
      toastApiError(error);
    } finally {
      setIsDownloadingPayments(false);
    }
  };

  const handleExportWebhookLogs = async () => {
    setIsDownloadingWebhooks(true);
    try {
      const blob = await api.webhooks.export({
        event_type: webhookEventType !== "all" ? webhookEventType : undefined,
        status: webhookStatus !== "all" ? webhookStatus : undefined,
        date_from: webhookFromDate,
        date_to: webhookToDate,
        search: webhookSearch || undefined,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `webhook_logs_export_${webhookFromDate}_${webhookToDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Webhook logs export downloaded successfully");
      setIsWebhookModalOpen(false);
    } catch (error) {
      console.error("Error exporting webhook logs:", error);
      toastApiError(error);
    } finally {
      setIsDownloadingWebhooks(false);
    }
  };

  const handleCreatePaymentLink = () => {
    router.push("/dashboard/payments?action=create-payment");
  };

  const handleViewDocs = () => {
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
            Create Payment
          </Button>
          <Button
            className="w-full justify-start h-12"
            variant="outline"
            onClick={() => setIsPaymentModalOpen(true)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Payments
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
            onClick={() => setIsWebhookModalOpen(true)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Webhook Logs
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

      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Export Payments"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export payments as CSV for the selected date range.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">From</label>
              <input
                type="date"
                value={paymentFromDate}
                onChange={(e) => setPaymentFromDate(e.target.value)}
                max={paymentToDate}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">To</label>
              <input
                type="date"
                value={paymentToDate}
                onChange={(e) => setPaymentToDate(e.target.value)}
                min={paymentFromDate}
                max={toIsoDate(today)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleExportPayments}
            disabled={isDownloadingPayments || !paymentFromDate || !paymentToDate}
          >
            {isDownloadingPayments ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              "Download Payments CSV"
            )}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
        title="Export Webhook Logs"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export webhook delivery logs with optional filters.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">From</label>
              <input
                type="date"
                value={webhookFromDate}
                onChange={(e) => setWebhookFromDate(e.target.value)}
                max={webhookToDate}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">To</label>
              <input
                type="date"
                value={webhookToDate}
                onChange={(e) => setWebhookToDate(e.target.value)}
                min={webhookFromDate}
                max={toIsoDate(today)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Event type</label>
              <select
                value={webhookEventType}
                onChange={(e) => setWebhookEventType(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {WEBHOOK_EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type === "all" ? "All" : type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                value={webhookStatus}
                onChange={(e) => setWebhookStatus(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {WEBHOOK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "All" : status}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Search</label>
            <input
              type="text"
              value={webhookSearch}
              onChange={(e) => setWebhookSearch(e.target.value)}
              placeholder="Search ID or payment ID"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleExportWebhookLogs}
            disabled={isDownloadingWebhooks}
          >
            {isDownloadingWebhooks ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              "Download Webhook Logs CSV"
            )}
          </Button>
        </div>
      </Modal>
    </>
  );
};
