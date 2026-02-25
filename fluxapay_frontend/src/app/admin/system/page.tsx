import {
  Activity,
  Blocks,
  Handshake,
  Webhook,
  CheckCircle2,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/Badge";

type SystemStatus = "operational" | "degraded" | "warning";

function statusMeta(status: SystemStatus) {
  if (status === "operational") {
    return {
      label: "Operational",
      variant: "success" as const,
      icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    };
  }

  if (status === "warning") {
    return {
      label: "Warning",
      variant: "warning" as const,
      icon: <Clock3 className="h-4 w-4 text-yellow-600" />,
    };
  }

  return {
    label: "Degraded",
    variant: "error" as const,
    icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
  };
}

export default function AdminSystemPage() {
  const systems = [
    {
      title: "API Uptime Status",
      value: "99.99%",
      subtitle: "Last 30 days",
      status: "operational" as const,
      icon: <Activity className="h-5 w-5 text-slate-500" />,
    },
    {
      title: "Blockchain Indexer Status",
      value: "Synced",
      subtitle: "Head lag: 0 blocks",
      status: "operational" as const,
      icon: <Blocks className="h-5 w-5 text-slate-500" />,
    },
    {
      title: "Settlement Partner Health",
      value: "Healthy",
      subtitle: "All payout rails responding",
      status: "operational" as const,
      icon: <Handshake className="h-5 w-5 text-slate-500" />,
    },
    {
      title: "Webhook Delivery Queue Size",
      value: "12",
      subtitle: "Pending deliveries",
      status: "warning" as const,
      icon: <Webhook className="h-5 w-5 text-slate-500" />,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operational health for core platform components.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {systems.map((system) => {
          const meta = statusMeta(system.status);

          return (
            <Card key={system.title}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{system.title}</CardTitle>
                {system.icon}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-2xl font-bold">{system.value}</div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{system.subtitle}</p>
                  <Badge
                    variant={meta.variant}
                    className="inline-flex items-center gap-1.5"
                  >
                    {meta.icon}
                    {meta.label}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
