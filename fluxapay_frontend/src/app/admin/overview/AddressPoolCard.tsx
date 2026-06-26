"use client";

import { useAddressPoolStats } from "@/hooks/useAddressPoolStats";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Network, Server } from "lucide-react";
import { cn } from "@/lib/utils";

export function AddressPoolCard() {
  const { stats, isLoading, error } = useAddressPoolStats();

  if (error) {
    return (
      <Card className="col-span-full border-red-500/20 bg-red-500/5">
        <CardHeader>
          <CardTitle className="text-red-500 text-sm font-medium">Deposit Address Pool Health</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500/80">Failed to load address pool statistics.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !stats) {
    return (
      <Card className="col-span-full animate-pulse">
        <CardHeader>
          <div className="h-5 w-48 bg-muted rounded"></div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg"></div>
            ))}
          </div>
          <div className="h-2 w-full bg-muted rounded-full"></div>
        </CardContent>
      </Card>
    );
  }

  const { available, assigned, cooldown, total } = stats;
  const availablePercentage = total > 0 ? (available / total) * 100 : 0;
  const utilizationPercentage = total > 0 ? (assigned / total) * 100 : 0;

  let statusColor = "text-green-500";
  let bgStatusColor = "bg-green-500";
  
  if (availablePercentage < 10) {
    statusColor = "text-red-500";
    bgStatusColor = "bg-red-500";
  } else if (availablePercentage <= 30) {
    statusColor = "text-amber-500";
    bgStatusColor = "bg-amber-500";
  }

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Network className="h-5 w-5 text-muted-foreground" />
            Deposit Address Pool Health
          </CardTitle>
          <CardDescription>Real-time monitoring of cryptocurrency deposit addresses</CardDescription>
        </div>
        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          <Server className="h-4 w-4" />
          Auto-scaling active
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl border bg-card shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">Available</p>
            <p className={cn("text-2xl font-bold", statusColor)}>
              {available.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{availablePercentage.toFixed(1)}% of pool</p>
          </div>
          
          <div className="p-4 rounded-xl border bg-card shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">Assigned</p>
            <p className="text-2xl font-bold text-foreground">
              {assigned.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Active payments</p>
          </div>
          
          <div className="p-4 rounded-xl border bg-card shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">On Cooldown</p>
            <p className="text-2xl font-bold text-amber-500">
              {cooldown.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pending recycle</p>
          </div>
          
          <div className="p-4 rounded-xl border bg-card shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Size</p>
            <p className="text-2xl font-bold text-foreground">
              {total.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total addresses</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Pool Utilization</span>
            <span className="font-semibold">{utilizationPercentage.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${utilizationPercentage}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
