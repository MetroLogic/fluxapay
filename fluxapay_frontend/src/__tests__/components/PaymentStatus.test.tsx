/**
 * Component tests for PaymentStatus component
 * Tests all checkout display states.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PaymentStatus } from '@/components/checkout/PaymentStatus';

describe('PaymentStatus', () => {
  it('renders pending state', () => {
    render(<PaymentStatus status="pending" />);
    expect(screen.getByText(/waiting for payment/i)).toBeInTheDocument();
  });

  it('renders confirmed state', () => {
    render(<PaymentStatus status="confirmed" />);
    expect(screen.getByText(/payment confirmed/i)).toBeInTheDocument();
  });

  it('renders expired state', () => {
    render(<PaymentStatus status="expired" />);
    expect(screen.getByText(/payment expired/i)).toBeInTheDocument();
  });

  it('renders failed state', () => {
    render(<PaymentStatus status="failed" />);
    expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
  });

  it('displays custom message when provided', () => {
    render(<PaymentStatus status="pending" message="Custom message here" />);
    expect(screen.getByText('Custom message here')).toBeInTheDocument();
  });
});
