import { NextRequest } from 'next/server';

// Reuse the same in-memory store from the status route
const paymentStatusStore = new Map<string, { status: string; createdAt: number }>();

/**
 * SSE endpoint for real-time payment status streaming.
 * Sends status updates every 2 seconds until terminal state.
 * Client connects via EventSource for instant payment confirmation.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ payment_id: string }> }
) {
    const { payment_id: paymentId } = await params;

    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();

            const sendEvent = (data: Record<string, unknown>) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch {
                    // Stream may be closed
                }
            };

            const interval = setInterval(() => {
                // Handle special test cases
                if (paymentId === 'expired') {
                    sendEvent({ status: 'expired' });
                    clearInterval(interval);
                    try { controller.close(); } catch { /* already closed */ }
                    return;
                }
                if (paymentId === 'confirmed') {
                    sendEvent({ status: 'confirmed' });
                    clearInterval(interval);
                    try { controller.close(); } catch { /* already closed */ }
                    return;
                }
                if (paymentId === 'failed') {
                    sendEvent({ status: 'failed' });
                    clearInterval(interval);
                    try { controller.close(); } catch { /* already closed */ }
                    return;
                }

                // Get or initialize payment status
                let paymentStatus = paymentStatusStore.get(paymentId);
                if (!paymentStatus) {
                    paymentStatus = { status: 'pending', createdAt: Date.now() };
                    paymentStatusStore.set(paymentId, paymentStatus);
                }

                // Simulate status change after 10 seconds (same as polling route)
                const timeSinceCreation = Date.now() - paymentStatus.createdAt;
                if (paymentStatus.status === 'pending' && timeSinceCreation > 10000) {
                    paymentStatus.status = 'confirmed';
                    paymentStatusStore.set(paymentId, paymentStatus);
                }

                sendEvent({ status: paymentStatus.status });

                // Close stream on terminal states
                if (['confirmed', 'expired', 'failed'].includes(paymentStatus.status)) {
                    clearInterval(interval);
                    try { controller.close(); } catch { /* already closed */ }
                }
            }, 2000);

            // Clean up when client disconnects
            request.signal.addEventListener('abort', () => {
                clearInterval(interval);
                try { controller.close(); } catch { /* already closed */ }
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
