import { NextRequest, NextResponse } from 'next/server';

/**
 * Mock API endpoint to fetch payment details
 * In production, this would connect to your backend service
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ payment_id: string }> }
) {
  const { payment_id: paymentId } = await params;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Mock payment data
  // In production, fetch from your database/backend
  const mockPayment = {
    id: paymentId,
    amount: 100,
    currency: 'USDC',
    address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGH',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
    status: 'pending' as const,
    successUrl: 'https://example.com/success',
    merchantName: 'FluxaPay Merchant',
    description: 'Payment for services',
  };

  // Simulate payment not found for specific IDs
  if (paymentId === 'not-found' || paymentId === '404') {
    return NextResponse.json(
      { error: 'Payment not found' },
      { status: 404 }
    );
  }

  // Simulate expired payment
  if (paymentId === 'expired') {
    return NextResponse.json({
      ...mockPayment,
      status: 'expired',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
  }

  // Simulate confirmed payment
  if (paymentId === 'confirmed') {
    return NextResponse.json({
      ...mockPayment,
      status: 'confirmed',
    });
  }

  return NextResponse.json(mockPayment);
}
