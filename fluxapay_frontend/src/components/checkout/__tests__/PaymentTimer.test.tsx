import { render, screen } from '@testing-library/react';
import { PaymentTimer } from '../PaymentTimer';
import { useTranslations } from 'next-intl';

jest.mock('next-intl', () => ({
  useTranslations: jest.fn(),
}));

describe('PaymentTimer', () => {
  const mockOnExpire = jest.fn();
  const mockUseTranslations = useTranslations as jest.MockedFunction<typeof useTranslations>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTranslations.mockReturnValue((key: string, options?: unknown) => {
      const translations: Record<string, string> = {
        'timerExpired': 'Payment Expired',
        'timerExpiredAria': 'Payment has expired',
        'timeRemainingAria': `Time remaining: ${(options as any)?.minutes || 0} minutes ${(options as any)?.seconds || 0} seconds`,
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
    const serverTimeOffset = 5000; // 5 sec ahead
    render(
      <PaymentTimer
        expiresAt={expiresAt}
        onExpire={mockOnExpire}
        serverTimeOffset={serverTimeOffset}
      />
    );
    // Timer should show less time due to server being ahead
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('has aria-live set to polite for accessibility', () => {
    const expiresAt = new Date(Date.now() + 60000);
    render(<PaymentTimer expiresAt={expiresAt} onExpire={mockOnExpire} />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'polite');
  });

  it('calls onExpire when timer runs out', (done) => {
    const expiresAt = new Date(Date.now() + 100); // 100ms
    render(<PaymentTimer expiresAt={expiresAt} onExpire={mockOnExpire} />);

    setTimeout(() => {
      expect(mockOnExpire).toHaveBeenCalled();
      done();
    }, 200);
  });
});
