"use client";

import { useState, useMemo } from "react";
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
import { RefreshCw, Ban } from "lucide-react";

// Mock data types
interface WebhookLog {
  id: string;
  eventType: string;
  merchant: string;
  endpoint: string;
  status: "success" | "failed" | "pending";
  attempts: number;
  timestamp: string;
}

// Mock data
const mockLogs: WebhookLog[] = [
  {
    id: "1",
    eventType: "payment_success",
    merchant: "Merchant A",
    endpoint: "https://merchant-a.com/webhook",
    status: "success",
    attempts: 1,
    timestamp: "2026-01-24T10:00:00Z",
  },
  {
    id: "2",
    eventType: "payment_failed",
    merchant: "Merchant B",
    endpoint: "https://merchant-b.com/webhook",
    status: "failed",
    attempts: 3,
    timestamp: "2026-01-24T09:30:00Z",
  },
  {
    id: "3",
    eventType: "settlement_completed",
    merchant: "Merchant C",
    endpoint: "https://merchant-c.com/webhook",
    status: "success",
    attempts: 1,
    timestamp: "2026-01-24T08:00:00Z",
  },
  {
    id: "4",
    eventType: "payment_success",
    merchant: "Merchant A",
    endpoint: "https://merchant-a.com/webhook",
    status: "failed",
    attempts: 2,
    timestamp: "2026-01-24T07:00:00Z",
  },
  {
    id: "5",
    eventType: "payment_failed",
    merchant: "Merchant D",
    endpoint: "https://merchant-d.com/webhook",
    status: "pending",
    attempts: 1,
    timestamp: "2026-01-24T06:00:00Z",
  },
];

const eventTypes = ["all", "payment_success", "payment_failed", "settlement_completed"];

export default function WebhooksPage() {
  const [failedOnly, setFailedOnly] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState("all");

  const filteredLogs = useMemo(() => {
    return mockLogs.filter((log) => {
      if (failedOnly && log.status !== "failed") return false;
      if (selectedEventType !== "all" && log.eventType !== selectedEventType) return false;
      return true;
    });
  }, [failedOnly, selectedEventType]);

  const metrics = useMemo(() => {
    const total = mockLogs.length;
    const successful = mockLogs.filter((log) => log.status === "success").length;
    const successRate = total > 0 ? ((successful / total) * 100).toFixed(2) : "0.00";

    // Generate mock delivery times once
    const deliveryTimes = [1200, 3400, 1800, 4500]; // Mock delivery times in ms
    const avgDeliveryTime = deliveryTimes.length > 0
      ? (deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length).toFixed(0)
      : "0";

    return { successRate, avgDeliveryTime };
  }, []);

  const handleRetry = (logId: string) => {
    // Mock retry action
    console.log(`Retrying webhook delivery for log ${logId}`);
    alert(`Retrying delivery for webhook ${logId}`);
  };

  const handleDisable = (merchant: string) => {
    // Mock disable action
    console.log(`Disabling webhooks for merchant ${merchant}`);
    alert(`Disabling webhooks for ${merchant}`);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Webhook Monitoring & Control</h1>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Success Rate</CardTitle>
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
            <div className="text-2xl font-bold">{metrics.avgDeliveryTime}ms</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="failed-only"
            checked={failedOnly}
            onCheckedChange={(checked) => setFailedOnly(checked as boolean)}
          />
          <label htmlFor="failed-only" className="text-sm font-medium">
            Failed only
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <label htmlFor="event-type" className="text-sm font-medium">
            Event type:
          </label>
          <Select value={selectedEventType} onValueChange={setSelectedEventType}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type === "all" ? "All" : type.replace("_", " ")}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Type</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{log.eventType.replace("_", " ")}</TableCell>
                  <TableCell>{log.merchant}</TableCell>
                  <TableCell className="max-w-xs truncate">{log.endpoint}</TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        log.status === "success"
                          ? "bg-green-100 text-green-800"
                          : log.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {log.status}
                    </span>
                  </TableCell>
                  <TableCell>{log.attempts}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(log.id)}
                        disabled={log.status === "success"}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisable(log.merchant)}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Disable
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredLogs.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              No webhook logs match the current filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}