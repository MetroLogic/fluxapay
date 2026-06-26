/**
 * Component tests for dashboard NotificationsCenter
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsCenter } from '@/features/dashboard/components/overview/NotificationsCenter';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockNotifications = [
  {
    id: 'wh-1',
    category: 'webhook_failure' as const,
    severity: 'critical' as const,
    title: 'Webhook delivery failed',
    description: 'payment.completed → https://example.com/hook',
    timestamp: '2026-01-01T10:00:00Z',
    href: '/dashboard/webhooks',
  },
  {
    id: 'pay-1',
    category: 'payout' as const,
    severity: 'info' as const,
    title: 'Payout settled',
    description: '$500.00 settled',
    timestamp: '2026-01-01T09:00:00Z',
    href: '/dashboard/settlements',
  },
];

const useDashboardNotificationsMock = vi.fn(() => ({
  notifications: mockNotifications,
  isLoading: false,
  error: null,
  unreadCount: 1,
}));

vi.mock('@/hooks/useDashboardNotifications', () => ({
  useDashboardNotifications: (...args: unknown[]) => useDashboardNotificationsMock(...args),
}));

describe('NotificationsCenter', () => {
  beforeEach(() => {
    useDashboardNotificationsMock.mockReturnValue({
      notifications: mockNotifications,
      isLoading: false,
      error: null,
      unreadCount: 1,
    });
  });

  it('renders the heading', () => {
    render(<NotificationsCenter />);
    expect(screen.getByText('Notifications Center')).toBeInTheDocument();
  });

  it('renders notification items', () => {
    render(<NotificationsCenter />);
    expect(screen.getByText('Webhook delivery failed')).toBeInTheDocument();
    expect(screen.getByText('Payout settled')).toBeInTheDocument();
  });

  it('shows active badge count', () => {
    render(<NotificationsCenter />);
    expect(screen.getByText('1 active')).toBeInTheDocument();
  });

  it('renders loading skeleton when loading', () => {
    useDashboardNotificationsMock.mockReturnValue({
      notifications: [],
      isLoading: true,
      error: null,
      unreadCount: 0,
    });
    render(<NotificationsCenter />);
    expect(screen.getByText('Notifications Center')).toBeInTheDocument();
  });

  it('shows all-clear badge when no unread', () => {
    useDashboardNotificationsMock.mockReturnValue({
      notifications: mockNotifications,
      isLoading: false,
      error: null,
      unreadCount: 0,
    });
    render(<NotificationsCenter />);
    expect(screen.getByText('All clear')).toBeInTheDocument();
  });
});
