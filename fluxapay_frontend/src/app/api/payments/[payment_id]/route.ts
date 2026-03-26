import { NextRequest, NextResponse } from 'next/server';

/**
 * Backend proxy for checkout payment details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ payment_id: string }> }
) {
  const { payment_id: paymentId } = await params;

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const upstream = await fetch(`${backendBaseUrl}/api/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const contentType = upstream.headers.get('content-type') || 'application/json';

  // Return the upstream response body/status as-is so the client can handle 404/500, etc.
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}
