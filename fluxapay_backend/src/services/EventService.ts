import { EventEmitter } from "events";

class EventService extends EventEmitter { }

export const eventBus = new EventService();

export enum AppEvents {
    PAYMENT_CONFIRMED = "payment.confirmed",
    PAYMENT_UPDATED = "payment.updated",
    PAYMENT_EXPIRED = "payment.expired",
    PAYMENT_PARTIALLY_PAID = "payment.partially_paid",
    PAYMENT_OVERPAID = "payment.overpaid",
}
