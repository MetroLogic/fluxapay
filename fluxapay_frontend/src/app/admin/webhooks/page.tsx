"use client";

import { useState, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import EmptyState from "@/components/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/Button";
import { RefreshCw, Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { useAdminWebhookLogs } from "@/hooks/useAdminWebhookLogs";
import { api } from "@/lib/api";

const eventTypes = [
  "all",
  "payment.created",
  "payment.pending",
  "payment.confirmed",
  "payment.failed",
  "payment.settled",
  "refund.created",
  "refund.completed",
  "refund.failed",
  "subscription.created",
  "subscription.cancelled",
  "subscription.renewed",
];

export default function WebhooksPage() {
  const [failedOnly, setFailedOnly] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { logs, pagination, isLoading, mutate } = useAdminWebhookLogs({
    page,
    limit,
    status: failedOnly ? "failed" : undefined,
    event_type: selectedEventType !== "all" ? selectedEventType : undefined,
  });

  const metrics = useMemo(() => {
    if (!logs || logs.length === 0) return { successRate: "0.00", avgDeliveryTime: "0" };
    const total = logs.length;
    const successful = logs.filter((log) => log.status === "delivered").length;
    const successRate = ((successful / total) * 100).toFixed(2);
    // Since we don't have true delivery duration in the API response easily without diffing timestamps, 
    // we return a static/placeholder or a very basic calculation.
    return { successRate, avgDeliveryTime: "N/A" };
  }, [logs]);

  const handleRetry = useCallback(async (logId: string) => {
    try {
      toast.loading(`Retrying webhook ${logId}...`, { id: logId });
      await api.admin.webhooks.retry(logId);
      toast.success(`Retry initiated for webhook ${logId}`, { id: logId });
      mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to retry webhook", { id: logId });
    }
  }, [mutate]);

  const handleDisable = useCallback(async (merchantId: string, merchantName?: string) => {
    if (!confirm(`Are you sure you want to disable webhooks for ${merchantName || merchantId}?`)) return;
    try {
      const toastId = `disable-${merchantId}`;
      toast.loading(`Disabling webhooks...`, { id: toastId });
      await api.admin.merchants.disableWebhook(merchantId);
      toast.success(`Webhooks disabled for ${merchantName || merchantId}`, { id: toastId });
      mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to disable webhooks");
    }
  }, [mutate]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Webhook Monitoring & Control</h1>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Rate (Current Page)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.successRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Delivery Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.avgDeliveryTime}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="failed-only"
            checked={failedOnly}
            onCheckedChange={(checked) => {
              setFailedOnly(checked as boolean);
              setPage(1);
            }}
          />
          <label htmlFor="failed-only" className="text-sm font-medium">
            Failed only
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <label htmlFor="event-type" className="text-sm font-medium">
            Event type:
          </label>
          <Select
            value={selectedEventType}
            onValueChange={(val) => {
              setSelectedEventType(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type === "all" ? "All Events" : type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Webhook Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Global Webhook Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <EmptyState
                    colSpan={7}
                    className="py-8"
                    message="No webhook logs match the current filters."
                  />
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium whitespace-nowrap">{log.event_type}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{log.merchant_name || log.merchant_id}</span>
                          <span className="text-xs text-muted-foreground">{log.merchant_email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={log.endpoint_url}>
                        {log.endpoint_url}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            log.status === "delivered"
                              ? "bg-green-100 text-green-800"
                              : log.status === "failed"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {log.status}
                        </span>
                        {log.http_status ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            HTTP {log.http_status}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{log.retry_count}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetry(log.id)}
                            disabled={log.status === "delivered" || log.status === "pending"}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisable(log.merchant_id, log.merchant_name)}
                          >
                            <Ban className="h-4 w-4 mr-1" />
                            Disable
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
              </span>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
                  disabled={page === pagination.total_pages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
