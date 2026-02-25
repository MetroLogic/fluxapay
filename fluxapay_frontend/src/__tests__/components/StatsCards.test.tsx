/**
 * Component tests for dashboard StatCard / StatsCards
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatsCards } from '@/features/dashboard/components/overview/StatsCards';

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
    // Multiple "up" trend change texts should be present
    const trendElements = screen.getAllByText(/from last month/i);
    expect(trendElements.length).toBeGreaterThanOrEqual(1);
  });
});
