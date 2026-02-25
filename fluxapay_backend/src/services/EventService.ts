import { EventEmitter } from "events";

class EventService extends EventEmitter { }

export const eventBus = new EventService();

export enum AppEvents {
    PAYMENT_CONFIRMED = "payment.confirmed",
}
