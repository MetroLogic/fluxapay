/**
 * Component tests for PaymentStatus component
 * Tests all checkout display states.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PaymentStatus } from '@/components/checkout/PaymentStatus';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('PaymentStatus', () => {
  it('renders pending state', () => {
    render(<PaymentStatus status="pending" />);
    expect(screen.getByText(/waitingForPayment/i)).toBeInTheDocument();
  });

  it('renders confirmed state', () => {
    render(<PaymentStatus status="confirmed" />);
    expect(screen.getByText(/checkout.confirmed/i)).toBeInTheDocument();
  });

  it('renders expired state', () => {
    render(<PaymentStatus status="expired" />);
    expect(screen.getByText(/checkout.expiredDescription/i)).toBeInTheDocument();
  });

  it('renders failed state', () => {
    render(<PaymentStatus status="failed" />);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('renders partially_paid state', () => {
    render(<PaymentStatus status="partially_paid" />);
    expect(screen.getByText(/checkout.partialReceived/i)).toBeInTheDocument();
  });

  it('renders overpaid state', () => {
    render(<PaymentStatus status="overpaid" />);
    expect(screen.getByText(/checkout.overpaymentReceived/i)).toBeInTheDocument();
  });

  it('renders paid state', () => {
    render(<PaymentStatus status="paid" />);
    expect(screen.getByText(/status.completed/i)).toBeInTheDocument();
  });

  it('renders completed state', () => {
    render(<PaymentStatus status="completed" />);
    expect(screen.getByText(/status.completed/i)).toBeInTheDocument();
  });

  it('displays custom message when provided', () => {
    render(<PaymentStatus status="pending" message="Custom message here" />);
    expect(screen.getByText('Custom message here')).toBeInTheDocument();
  });
});
