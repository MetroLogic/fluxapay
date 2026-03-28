import { NextRequest } from 'next/server';

/**
 * Backend proxy for checkout SSE stream.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ payment_id: string }> }
) {
    const { payment_id: paymentId } = await params;

    const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const upstream = await fetch(
        `${backendBaseUrl}/api/v1/payments/checkout/${encodeURIComponent(paymentId)}/stream`,
        {
            method: 'GET',
            headers: {
                Accept: 'text/event-stream',
            },
            cache: 'no-store',
            signal: request.signal,
        },
    );

    // If upstream isn't an SSE stream, return it as-is for the client to handle.
    const headers = new Headers(upstream.headers);
    headers.set('Cache-Control', 'no-store');

    return new Response(upstream.body, {
        status: upstream.status,
        headers,
    });
}
