/**
 * Interfaces for Analytics Data
 */

export interface RevenueByCountry {
    country: string;
    revenue: number;
    payments: number;
}

export interface PaymentDistribution {
    method: string;
    value: number;
    color?: string;
}

export interface RevenueTrends {
    date: string;
    revenue: number;
    target?: number;
}

export interface AnalyticsSummary {
    totalRevenue: number;
    totalPayments: number;
    activeMerchants: number;
    growthRate: number;
}

/**
 * Analytics Service Implementation (Mock Data)
 */
export const analyticsService = {
    getRevenueByCountry: async (): Promise<RevenueByCountry[]> => {
        // Mock data to ensure dashboard works without backend
        return [
            { country: 'Nigeria', revenue: 45000, payments: 1200 },
            { country: 'Ghana', revenue: 28000, payments: 850 },
            { country: 'Kenya', revenue: 32000, payments: 980 },
            { country: 'South Africa', revenue: 55000, payments: 1500 },
            { country: 'Egypt', revenue: 15000, payments: 450 },
        ];
    },

    getPaymentDistribution: async (): Promise<PaymentDistribution[]> => {
        return [
            { method: 'Stripe', value: 45, color: '#6366f1' },
            { method: 'Crypto (USDC)', value: 30, color: '#22c55e' },
            { method: 'PayPal', value: 15, color: '#f59e0b' },
            { method: 'Bank Transfer', value: 10, color: '#64748b' },
        ];
    },

    getRevenueTrends: async (): Promise<RevenueTrends[]> => {
        return [
            { date: '2026-02-19', revenue: 1200, target: 1000 },
            { date: '2026-02-20', revenue: 1500, target: 1100 },
            { date: '2026-02-21', revenue: 1100, target: 1200 },
            { date: '2026-02-22', revenue: 1800, target: 1300 },
            { date: '2026-02-23', revenue: 2100, target: 1400 },
            { date: '2026-02-24', revenue: 1950, target: 1500 },
            { date: '2026-02-25', revenue: 2400, target: 1600 },
        ];
    },

    getSummary: async (): Promise<AnalyticsSummary> => {
        return {
            totalRevenue: 175000,
            totalPayments: 4980,
            activeMerchants: 124,
            growthRate: 15.5,
        };
    }
};
