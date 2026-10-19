import { eventBus, AppEvents } from "./EventService";

export function publishRefundStatusUpdate(refund: unknown): void {
  eventBus.emit(AppEvents.REFUND_UPDATED, refund);
}
