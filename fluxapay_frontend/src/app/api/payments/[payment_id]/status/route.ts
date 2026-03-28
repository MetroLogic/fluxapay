import { NextRequest, NextResponse } from 'next/server';

/**
 * Backend proxy for checkout payment status polling.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ payment_id: string }> }
) {
  const { payment_id: paymentId } = await params;

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const upstream = await fetch(
    `${backendBaseUrl}/api/v1/payments/checkout/${encodeURIComponent(paymentId)}/status`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    },
  );

  const contentType = upstream.headers.get('content-type') || 'application/json';
  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}
