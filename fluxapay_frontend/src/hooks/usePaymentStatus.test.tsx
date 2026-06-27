import { describe, expect, it } from 'vitest';
import { normalizePaymentResponse } from './usePaymentStatus';

describe('normalizePaymentResponse', () => {
  it('maps merchant_branding from charge API responses into checkout branding fields', () => {
    const payment = normalizePaymentResponse({
      id: 'ch_123',
      amount: 25,
      currency: 'USDC',
      address: 'GABC',
      expiresAt: '2026-06-27T12:00:00.000Z',
      status: 'pending',
      merchant_branding: {
        logo_url: 'https://cdn.example.com/acme.png',
        primary_color: 'ff5500',
        business_name: 'Acme Store',
      },
    });

    expect(payment.checkoutLogoUrl).toBe('https://cdn.example.com/acme.png');
    expect(payment.checkoutAccentColor).toBe('#ff5500');
    expect(payment.merchantName).toBe('Acme Store');
    expect(payment.expiresAt).toEqual(new Date('2026-06-27T12:00:00.000Z'));
  });

  it('keeps legacy top-level checkout branding fields as fallbacks', () => {
    const payment = normalizePaymentResponse({
      id: 'pay_123',
      amount: 10,
      currency: 'USDC',
      address: 'GDEF',
      expiresAt: '2026-06-27T12:00:00.000Z',
      status: 'pending',
      merchantName: 'Legacy Store',
      checkoutLogoUrl: 'https://cdn.example.com/legacy.png',
      checkoutAccentColor: '#3366ff',
    });

    expect(payment.checkoutLogoUrl).toBe('https://cdn.example.com/legacy.png');
    expect(payment.checkoutAccentColor).toBe('#3366ff');
    expect(payment.merchantName).toBe('Legacy Store');
  });
});
