/**
 * Webhook Event Mapping Utility
 * Maps between canonical event names (product spec) and legacy names (backend enums)
 * Supports backward compatibility for existing integrations
 */

export type CanonicalEventName =
    | 'payment.created'
    | 'payment.pending'
    | 'payment.confirmed'
    | 'payment.partially_paid'
    | 'payment.overpaid'
    | 'payment.failed'
    | 'payment.settled'
    | 'refund.created'
    | 'refund.completed'
    | 'refund.failed'
    | 'subscription.created'
    | 'subscription.cancelled'
    | 'subscription.renewed';

export type LegacyEventName =
    | 'payment_completed'
    | 'payment_confirmed'
    | 'payment_partially_paid'
    | 'payment_overpaid'
    | 'payment_failed'
    | 'payment_pending'
    | 'refund_completed'
    | 'refund_failed'
    | 'subscription_created'
    | 'subscription_cancelled'
    | 'subscription_renewed';

export type WebhookEventName = CanonicalEventName | LegacyEventName;

// Mapping from legacy names to canonical names
const legacyToCanonical: Record<LegacyEventName, CanonicalEventName> = {
    'payment_completed': 'payment.settled',
    'payment_confirmed': 'payment.confirmed',
    'payment_partially_paid': 'payment.partially_paid',
    'payment_overpaid': 'payment.overpaid',
    'payment_failed': 'payment.failed',
    'payment_pending': 'payment.pending',
    'refund_completed': 'refund.completed',
    'refund_failed': 'refund.failed',
    'subscription_created': 'subscription.created',
    'subscription_cancelled': 'subscription.cancelled',
    'subscription_renewed': 'subscription.renewed',
};

// Mapping from canonical names to legacy names (for backward compat)
const canonicalToLegacy: Record<CanonicalEventName, LegacyEventName> = {
    'payment.created': 'payment_pending',
    'payment.pending': 'payment_pending',
    'payment.confirmed': 'payment_confirmed',
    'payment.partially_paid': 'payment_partially_paid',
    'payment.overpaid': 'payment_overpaid',
    'payment.failed': 'payment_failed',
    'payment.settled': 'payment_completed',
    'refund.created': 'refund_completed',
    'refund.completed': 'refund_completed',
    'refund.failed': 'refund_failed',
    'subscription.created': 'subscription_created',
    'subscription.cancelled': 'subscription_cancelled',
    'subscription.renewed': 'subscription_renewed',
};

/**
 * Convert legacy event name to canonical name
 */
export function toLegacyEventName(canonical: CanonicalEventName): LegacyEventName {
    return canonicalToLegacy[canonical];
}

/**
 * Convert canonical event name to legacy name
 */
export function toCanonicalEventName(legacy: LegacyEventName): CanonicalEventName {
    return legacyToCanonical[legacy];
}

/**
 * Normalize event name to canonical form
 */
export function normalizeEventName(eventName: WebhookEventName): CanonicalEventName {
    if (isCanonicalEventName(eventName)) {
        return eventName;
    }
    return toCanonicalEventName(eventName as LegacyEventName);
}

/**
 * Check if event name is canonical
 */
export function isCanonicalEventName(eventName: string): eventName is CanonicalEventName {
    return eventName.includes('.');
}

/**
 * Check if event name is legacy
 */
export function isLegacyEventName(eventName: string): eventName is LegacyEventName {
    return eventName.includes('_');
}
