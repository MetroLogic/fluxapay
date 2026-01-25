import { Payment } from "../types";
import {
  ExternalLink,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/Button";

interface PaymentDetailsProps {
  payment: Payment;
}

const STELLAR_EXPLORER_BASE = "https://stellar.expert/explorer/public/tx";

export function PaymentDetails({ payment }: PaymentDetailsProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "processing":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl border border-border">
        <div>
          <p className="text-sm text-muted-foreground">Amount</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight">
              {payment.amount.toLocaleString()}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">
              {payment.currency}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-background border border-border shadow-sm">
            {getStatusIcon(payment.status)}
            <span className="capitalize font-medium text-sm">
              {payment.status}
            </span>
          </div>
        </div>
      </div>

      {/* Core Details */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <p className="text-muted-foreground">Payment ID</p>
          <p className="font-mono">{payment.id}</p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">Merchant</p>
          <p className="font-medium">{payment.merchantName}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {payment.merchantId}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">Created At</p>
          <p>{new Date(payment.createdAt).toLocaleString()}</p>
        </div>
        {payment.settlementId && (
          <div className="space-y-1">
            <p className="text-muted-foreground">Settlement ID</p>
            <p className="font-mono text-primary cursor-pointer hover:underline">
              {payment.settlementId}
            </p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="pt-4 border-t border-border">
        <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
          Event Timeline
        </h4>
        <div className="space-y-6 relative ml-2">
          {/* Vertical Line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-border/60 -z-10" />

          {payment.events.map((event, idx) => (
            <div key={event.id} className="relative flex items-start gap-4">
              {/* Dot */}
              <div
                className={`mt-1 h-4 w-4 rounded-full border-2 border-background shadow-sm z-10 
                 ${event.type === "on-chain" ? "bg-blue-500" : event.type === "system" ? "bg-gray-400" : "bg-purple-500"}`}
              />

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{event.title}</p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {event.description}
                </p>

                {event.txHash && (
                  <a
                    href={`${STELLAR_EXPLORER_BASE}/${event.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    View on Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {payment.networkTxHash && (
        <div className="pt-4 mt-2">
          <a
            href={`${STELLAR_EXPLORER_BASE}/${payment.networkTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full text-sm"
          >
            <ExternalLink className="h-4 w-4" />
            View Settlement Transaction
          </a>
        </div>
      )}
    </div>
  );
}
