import { NextRequest, NextResponse } from 'next/server';
import {
  getClientIp,
  isBotUserAgent,
  sseLimiter,
  logAbuseEvent,
} from '@/lib/rateLimit';

// Track active SSE connections per IP
const activeConnections = new Map<string, Set<string>>();
const MAX_CONCURRENT_CONNECTIONS_PER_IP = 5;

/**
 * Backend proxy for checkout SSE stream with rate limiting, connection capping, and bot detection.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ payment_id: string }> }
) {
    const { payment_id: paymentId } = await params;
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    // Bot detection
    if (isBotUserAgent(userAgent)) {
        logAbuseEvent('bot_detected', clientIp, {
            paymentId,
            userAgent,
        });
        return NextResponse.json(
            { error: 'Access denied' },
            { status: 403 }
        );
    }

    // Rate limiting: max 10 requests per 60 seconds
    if (!sseLimiter.isAllowed(clientIp)) {
        const resetMs = sseLimiter.getResetTimeMs(clientIp);
        logAbuseEvent('sse_rate_limit_exceeded', clientIp, {
            paymentId,
            resetMs,
        });
        return NextResponse.json(
            { error: 'Too many requests' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.ceil(resetMs / 1000)),
                },
            }
        );
    }

    // Connection capping: max 5 concurrent SSE connections per IP
    const connections = activeConnections.get(clientIp) || new Set();
    if (connections.size >= MAX_CONCURRENT_CONNECTIONS_PER_IP) {
        logAbuseEvent('sse_connection_cap_exceeded', clientIp, {
            paymentId,
            currentConnections: connections.size,
            maxAllowed: MAX_CONCURRENT_CONNECTIONS_PER_IP,
        });
        return NextResponse.json(
            { error: 'Too many concurrent connections' },
            { status: 429 }
        );
    }

    // Add connection tracking
    const connectionId = `${paymentId}-${Date.now()}-${Math.random()}`;
    connections.add(connectionId);
    activeConnections.set(clientIp, connections);

    const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    try {
        const upstream = await fetch(
            `${backendBaseUrl}/api/v1/payments/${encodeURIComponent(paymentId)}/stream`,
            {
                method: 'GET',
                headers: {
                    Accept: 'text/event-stream',
                },
                cache: 'no-store',
                signal: request.signal,
            },
        );

        // If upstream isn't successful, return error
        if (!upstream.ok) {
            return new Response(upstream.body, {
                status: upstream.status,
                headers: new Headers(upstream.headers),
            });
        }

        // Create wrapper to track when connection closes
        const headers = new Headers(upstream.headers);
        headers.set('Cache-Control', 'no-store');
        // Add security headers to prevent client-side abuse
        headers.set('X-Content-Type-Options', 'nosniff');

        // Wrap response body to clean up connection tracking on close
        const reader = upstream.body?.getReader();

        const wrappedBody = new ReadableStream({
            async start(controller) {
                try {
                    while (reader) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        controller.enqueue(value);
                    }
                } catch (err) {
                    controller.error(err);
                } finally {
                    // Clean up connection tracking
                    connections.delete(connectionId);
                    if (connections.size === 0) {
                        activeConnections.delete(clientIp);
                    }
                    controller.close();
                }
            },
        });

        return new Response(wrappedBody, {
            status: upstream.status,
            headers,
        });
    } catch (err) {
        // Clean up on error
        connections.delete(connectionId);
        if (connections.size === 0) {
            activeConnections.delete(clientIp);
        }
        throw err;
    }
}
