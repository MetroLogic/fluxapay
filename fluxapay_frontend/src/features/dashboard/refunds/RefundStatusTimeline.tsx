import { Badge } from "@/components/Badge";
import { CheckCircle, Clock, AlertCircle, RotateCcw } from "lucide-react";
import type { RefundStatus } from "./types";

interface TimelineStep {
  status: RefundStatus;
  label: string;
  timestamp?: string;
}

const STATUS_CONFIG: Record<
  RefundStatus,
  { icon: typeof CheckCircle; variant: "success" | "warning" | "info" | "error" }
> = {
  completed: { icon: CheckCircle, variant: "success" },
  processing: { icon: RotateCcw, variant: "warning" },
  pending: { icon: Clock, variant: "info" },
  failed: { icon: AlertCircle, variant: "error" },
};

const STATUS_ORDER: RefundStatus[] = [
  "pending",
  "processing",
  "completed",
];

interface RefundStatusTimelineProps {
  status: RefundStatus;
  createdAt: string;
  updatedAt?: string;
  failedReason?: string;
}

export function RefundStatusTimeline({
  status,
  createdAt,
  updatedAt,
  failedReason,
}: RefundStatusTimelineProps) {
  const steps: TimelineStep[] = STATUS_ORDER.map((s) => ({
    status: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
    timestamp:
      s === "pending"
        ? createdAt
        : s === "processing" && updatedAt
          ? updatedAt
          : s === "completed" && status === "completed"
            ? updatedAt
            : undefined,
  }));

  if (status === "failed") {
    steps.push({
      status: "failed",
      label: "Failed",
      timestamp: updatedAt,
    });
  }

  const currentIdx = STATUS_ORDER.indexOf(status);
  const isFailed = status === "failed";

  return (
    <div className="space-y-0">
      {steps.map((step, idx) => {
        const config = STATUS_CONFIG[step.status];
        const Icon = config.icon;
        const isActive = idx === currentIdx || (isFailed && idx === steps.length - 1);
        const isCompleted =
          !isFailed && idx < currentIdx;
        const isPending = !isCompleted && !isActive;

        return (
          <div key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                  isCompleted
                    ? "border-success bg-success/10 text-success"
                    : isActive
                      ? `border-${config.variant} bg-${config.variant}/10 text-${config.variant}`
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`w-0.5 flex-1 ${
                    isCompleted ? "bg-success" : "bg-border"
                  }`}
                />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm font-medium ${
                    isPending ? "text-muted-foreground" : ""
                  }`}
                >
                  {step.label}
                </p>
                {isActive && (
                  <Badge variant={config.variant}>
                    {isFailed ? "Failed" : "Current"}
                  </Badge>
                )}
                {isCompleted && (
                  <Badge variant="success">Done</Badge>
                )}
              </div>
              {step.timestamp && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(step.timestamp).toLocaleString()}
                </p>
              )}
              {isFailed && failedReason && (
                <p className="mt-1 text-xs text-destructive">
                  {failedReason}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
