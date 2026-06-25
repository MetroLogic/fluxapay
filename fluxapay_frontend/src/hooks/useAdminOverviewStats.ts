"use client";

import { useMemo } from "react";
import { useAdminMerchants } from "./useAdminMerchants";
import { useAdminSettlements, AdminSettlementRow } from "./useAdminSettlements";

export type AdminActivityItem =
  | { type: "payment"; data: AdminSettlementRow }
  | { type: "signup"; id: string; merchantName: string; createdAt: string };

export interface AdminOverviewStats {
  totalVolume: number;
  totalMerchants: number;
  activeMerchants: number;
  totalFees: number;
  pendingSettlements: number;
  volumeData: { name: string; volume: number }[];
  statusChartData: { name: string; value: number; color: string }[];
  recentActivity: AdminActivityItem[];
}

export function useAdminOverviewStats() {
  const {
    merchants,
    isLoading: merchantsLoading,
    error: merchantsError,
  } = useAdminMerchants({ limit: 1000 });
  const {
    settlements,
    isLoading: settlementsLoading,
    error: settlementsError,
  } = useAdminSettlements({ limit: 1000 });

  const stats = useMemo((): AdminOverviewStats | null => {
    if (merchantsError || settlementsError) return null;
    
    const totalMerchants = merchants.length;
    const activeMerchants = merchants.filter((m) => m.accountStatus === "active").length;
    
    // Total Volume from settlements
    const totalVolume = settlements.reduce((sum, s) => sum + s.amount, 0);
    
    // Total fees
    const totalFees = settlements.reduce((sum, s) => {
        return sum + (s.fees?.network || 0) + (s.fees?.platform || 0);
    }, 0);
    
    const pendingSettlements = settlements.filter(s => s.status === "pending").length;

    // Last 7 days volume data
    const volumeData: { name: string; volume: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const name = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const dateStr = d.toISOString().split("T")[0];
        
        const dayVol = settlements
            .filter(s => s.createdAt && s.createdAt.startsWith(dateStr))
            .reduce((sum, s) => sum + s.amount, 0);
            
        volumeData.push({ name, volume: dayVol });
    }

    // Status Chart
    const statusCounts = settlements.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statusChartData = [
      { name: "Completed", value: statusCounts["completed"] || statusCounts["resolved"] || 0, color: "#22c55e" },
      { name: "Processing", value: statusCounts["processing"] || statusCounts["pending"] || 0, color: "#eab308" },
      { name: "Failed", value: statusCounts["failed"] || 0, color: "#ef4444" },
    ].filter((d) => d.value > 0);

    // Recent Activity Feed
    const signups: AdminActivityItem[] = merchants.map(m => ({
      type: "signup",
      id: m.id,
      merchantName: m.businessName || m.email,
      createdAt: m.dateJoined,
    }));
    
    const paymentActivities: AdminActivityItem[] = settlements.map(s => ({
      type: "payment",
      data: s,
    }));
    
    const recentActivity = [...paymentActivities, ...signups]
      .sort((a, b) => {
        const dateA = a.type === "payment" ? a.data.createdAt : a.createdAt;
        const dateB = b.type === "payment" ? b.data.createdAt : b.createdAt;
        return new Date(dateB || 0).getTime() - new Date(dateA || 0).getTime();
      })
      .slice(0, 5);

    return {
      totalVolume,
      totalMerchants,
      activeMerchants,
      totalFees,
      pendingSettlements,
      volumeData,
      statusChartData,
      recentActivity,
    };
  }, [merchants, settlements, merchantsError, settlementsError]);

  return {
    stats,
    isLoading: merchantsLoading || settlementsLoading,
    error: merchantsError || settlementsError,
  };
}
