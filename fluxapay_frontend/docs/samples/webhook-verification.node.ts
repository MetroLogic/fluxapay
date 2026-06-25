/**
 * FluxaPay Webhook Signature Verification - Node.js/TypeScript
 * 
 * This file demonstrates how to verify webhook signatures from FluxaPay
 * in a Node.js/TypeScript environment.
 * 
 * Copy and adapt this code to your webhook handler.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * Options for webhook verification
 */
interface WebhookVerificationOptions {
    /** Maximum age of webhook in seconds (default: 300 = 5 minutes) */
    replayProtectionWindowSeconds?: number;
    /** Set of already processed webhook IDs for deduplication */
    processedWebhookIds?: Set<string>;
}

/**
 * Verification result
 */
interface VerificationResult {
    valid: boolean;
    error?: string;
}

/**
 * Verify a FluxaPay webhook signature
 * 
 * @param payload - Raw JSON payload as string
 * @param signature - Signature from X-FluxaPay-Signature header
 * @param timestamp - Timestamp from X-FluxaPay-Timestamp header
 * @param secret - Your webhook secret (whsec_...)
 * @param options - Verification options
 * @returns Verification result with valid flag and optional error message
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string,
    secret: string,
    options: WebhookVerificationOptions = {}
): VerificationResult {
    const {
        replayProtectionWindowSeconds = 300,
        processedWebhookIds = new Set(),
    } = options;

    // 1. Verify timestamp is within acceptable window
    const webhookTime = new Date(timestamp).getTime();
    const currentTime = Date.now();
    const timeDiffSeconds = (currentTime - webhookTime) / 1000;

    if (timeDiffSeconds < 0) {
        return { valid: false, error: 'Webhook timestamp is in the future' };
    }

    if (timeDiffSeconds > replayProtectionWindowSeconds) {
        return {
            valid: false,
            error: `Webhook timestamp is older than ${replayProtectionWindowSeconds} seconds`,
        };
    }

    // 2. Compute expected signature
    const signingString = `${timestamp}.${payload}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signingString)
        .digest('hex');

    // 3. Compare signatures using constant-time comparison
    // This prevents timing attacks
    let isValid = false;
    try {
        isValid = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch {
        // timingSafeEqual throws if lengths don't match
        return { valid: false, error: 'Signature verification failed' };
    }

    if (!isValid) {
        return { valid: false, error: 'Signature verification failed' };
    }

    return { valid: true };
}

/**
 * Express middleware for webhook signature verification
 * 
 * Usage:
 * app.post('/webhooks/fluxapay', verifyWebhookMiddleware, handleWebhook);
 */
export function verifyWebhookMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const signature = req.headers['x-fluxapay-signature'] as string;
    const timestamp = req.headers['x-fluxapay-timestamp'] as string;
    const secret = process.env.FLUXAPAY_WEBHOOK_SECRET;

    if (!signature || !timestamp || !secret) {
        res.status(401).json({ error: 'Missing webhook headers or secret' });
        return;
    }

    // Get raw body as string (important: must be before body parsing)
    const payload = JSON.stringify(req.body);

    const verification = verifyWebhookSignature(
        payload,
        signature,
        timestamp,
        secret,
        { replayProtectionWindowSeconds: 300 }
    );

    if (!verification.valid) {
        res.status(401).json({ error: verification.error });
        return;
    }

    next();
}

/**
 * Example webhook handler
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
    try {
        const { event, data } = req.body;

        console.log(`Received verified webhook: ${event}`);

        // Process different event types
        switch (event) {
            case 'payment_confirmed':
                await handlePaymentConfirmed(data);
                break;
            case 'payment_failed':
                await handlePaymentFailed(data);
                break;
            case 'refund_completed':
                await handleRefundCompleted(data);
                break;
            default:
                console.warn(`Unknown event type: ${event}`);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Example event handlers
 */
async function handlePaymentConfirmed(data: any): Promise<void> {
    console.log('Processing payment confirmation:', data.payment_id);
    // Your business logic here
}

async function handlePaymentFailed(data: any): Promise<void> {
    console.log('Processing payment failure:', data.payment_id);
    // Your business logic here
}

async function handleRefundCompleted(data: any): Promise<void> {
    console.log('Processing refund completion:', data.refund_id);
    // Your business logic here
}

/**
 * Example: Manual verification without middleware
 */
export function manualVerificationExample(
    rawBody: string,
    headers: Record<string, string>,
    secret: string
): boolean {
    const signature = headers['x-fluxapay-signature'];
    const timestamp = headers['x-fluxapay-timestamp'];

    const result = verifyWebhookSignature(
        rawBody,
        signature,
        timestamp,
        secret
    );

    if (!result.valid) {
        console.error('Webhook verification failed:', result.error);
        return false;
    }

    console.log('Webhook verified successfully');
    return true;
}

/**
 * Example: Testing webhook signature generation
 */
export function generateTestWebhookSignature(
    payload: Record<string, any>,
    secret: string,
    timestamp?: string
): { signature: string; timestamp: string } {
    const ts = timestamp || new Date().toISOString();
    const payloadString = JSON.stringify(payload);
    const signingString = `${ts}.${payloadString}`;

    const signature = crypto
        .createHmac('sha256', secret)
        .update(signingString)
        .digest('hex');

    return { signature, timestamp: ts };
}
