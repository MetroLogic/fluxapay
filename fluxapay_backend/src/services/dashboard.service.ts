import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

export async function getDashboardOverview() {
  const sampleMetrics = {
    revenue: {
      today: 125000,
      week: 840000,
      month: 3120000,
    },
    payments: {
      count: 1240,
      amount: 3960000,
    },
    pending_payments: 18,
    success_rate: 96.3,
    average_transaction_value: 3193.55,
  };
  /* 
   * temporarily return sample data until we have a module to pull data for metrics from 
  */
  return {
    message: "Dashboard overview recovered",
    data: sampleMetrics,
  };
}



export async function getDashboardAnalytics() {
  const sampleAnalytics = {
  "volume_over_time": [
    { "period": "2026-01-18", "count": 32, "amount": 124000 },
    { "period": "2026-01-19", "count": 41, "amount": 156000 }
  ],
  "status_breakdown": {
    "success": 1120,
    "pending": 18,
    "failed": 102
  },
  "revenue_trend": [
    { "period": "2026-01", "revenue": 3120000 }
  ]
}
/* 
   * temporarily return sample data until we have a module to pull data for metrics from 
  */
  return {
    message: "Dashboard analytics recovered",
    data: sampleAnalytics,
  };
}



export async function getDashboardActivity() {
  const sampleActivity = {
  "recent_payments": [
    {
      "id": "pay_123",
      "amount": 5000,
      "status": "SUCCESS",
      "customer": "John Doe",
      "created_at": "2026-01-23T14:22:10Z"
    }
  ],
  "recent_settlements": [
    {
      "id": "set_456",
      "amount": 120000,
      "status": "COMPLETED",
      "settled_at": "2026-01-22T09:00:00Z"
    }
  ],
  "failed_alerts": [
    {
      "id": "pay_789",
      "reason": "Insufficient funds",
      "created_at": "2026-01-23T10:11:42Z"
    }
  ]
}

/* 
   * temporarily return sample data until we have a module to pull data for metrics from 
  */
  return {
    message: "Dashboard activity recovered",
    data: sampleActivity,
  };
}
