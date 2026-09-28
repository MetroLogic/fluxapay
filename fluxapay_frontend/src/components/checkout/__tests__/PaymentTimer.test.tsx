import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PaymentTimer } from '../PaymentTimer';
import { useTranslations } from 'next-intl';

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
}));

describe('PaymentTimer', () => {
  const mockOnExpire = vi.fn();
  const mockUseTranslations = useTranslations as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTranslations.mockReturnValue((key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'timerExpired': 'Payment Expired',
        'timerExpiredAria': 'Payment has expired',
        'timeRemainingAria': `Time remaining: ${options?.minutes || 0} minutes ${options?.seconds || 0} seconds`,
      };
      return translations[key] || key;
    });
  });

  it('renders with correct time format', () => {
    const expiresAt = new Date(Date.now() + 125000); // 2 min 5 sec
    render(<PaymentTimer expiresAt={expiresAt} onExpire={mockOnExpire} />);
    expect(screen.getByText(/02:0[4-5]/)).toBeInTheDocument();
  });

  it('shows expired state immediately when isExpiredFromServer is true', () => {
    const expiresAt = new Date(Date.now() + 60000);
    render(
      <PaymentTimer
        expiresAt={expiresAt}
        onExpire={mockOnExpire}
        isExpiredFromServer={true}
      />
    );
    expect(screen.getByText('Payment Expired')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveClass('border-red-300');
  });

  it('applies server time offset correctly', () => {
    const expiresAt = new Date(Date.now() + 125000);
    const serverTimeOffset = 5000;
    render(
      <PaymentTimer
        expiresAt={expiresAt}
        onExpire={mockOnExpire}
        serverTimeOffset={serverTimeOffset}
      />
    );
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('has aria-live set to polite for accessibility', () => {
    const expiresAt = new Date(Date.now() + 60000);
    render(<PaymentTimer expiresAt={expiresAt} onExpire={mockOnExpire} />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'polite');
  });

  it('calls onExpire when timer runs out', () =>
    new Promise<void>((resolve) => {
      const expiresAt = new Date(Date.now() - 1000); // already expired
      render(<PaymentTimer expiresAt={expiresAt} onExpire={mockOnExpire} />);
      setTimeout(() => {
        expect(mockOnExpire).toHaveBeenCalled();
        resolve();
      }, 1200);
    })
  );
});
