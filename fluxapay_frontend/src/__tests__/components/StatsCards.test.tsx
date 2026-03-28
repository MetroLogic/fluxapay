/**
 * Component tests for dashboard StatCard / StatsCards
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StatsCards } from '@/features/dashboard/components/overview/StatsCards';

vi.mock('@/features/dashboard/context/DashboardDateRangeContext', () => ({
  useDashboardDateRange: () => ({ dateRange: { from: undefined, to: undefined } }),
}));

const mockStats = {
  totalRevenue: 45231.89,
  totalPayments: 120,
  pendingPayments: 5,
  successRate: 94.5,
  avgTransaction: 376.93,
  totalSettled: 40000,
  volumeByDay: [],
  revenueByWeek: [],
  statusDistribution: [],
};

vi.mock('@/hooks/useDashboardStats', () => ({
  useDashboardStats: () => ({ stats: mockStats, isLoading: false, error: null }),
}));

describe('StatsCards', () => {
  it('renders all metric cards', () => {
    render(<StatsCards />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Total Payments')).toBeInTheDocument();
    expect(screen.getByText('Pending Payments')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
  });

  it('displays revenue value', () => {
    render(<StatsCards />);
    expect(screen.getByText('$45,231.89')).toBeInTheDocument();
  });

  it('shows trend indicators', () => {
    render(<StatsCards />);
    // success rate trend text
    expect(screen.getByText('94.5%')).toBeInTheDocument();
  });
});
