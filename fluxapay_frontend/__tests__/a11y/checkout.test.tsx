import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { expect } from '@virtual/expect';
import { vi } from 'vitest';

import CheckoutPage from '@/app/pay/[payment_id]/page';

jest-axe.extend(expect);

const mockParams = { payment_id: 'test-payment-id' };

function mockFetchStatus(status: 'pending' | 'confirmed' | 'expired') {
  vi.stubBlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status }),
    } as Response)
  ));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Checkout Page Accessibility', () => {
  it('has no axe violations when payment is pending', async () => {
    mockFetchStatus('pending');
    const { container } = render(<CheckoutPage params={mockParams} />);
    await waitFor(() => screen.getByText(/pending/i));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations when payment is confirmed', async () => {
    mockFetchStatus('confirmed');
    const { container } = render(<CheckoutPage params={mockParams} />);
    await waitFor(() => screen.getByText(/confirmed/i));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations when payment is expired', async () => {
    mockFetchStatus('expired');
    const { container } = render(<CheckoutPage params={mockParams} />);
    await waitFor(() => screen.getByText(/expired/i));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
