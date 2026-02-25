/**
 * settlementBatch.service.test.ts
 *
 * Unit tests for the schedule-filtering logic.
 * Run with:  npx jest settlementBatch.service.test
 */

import { isMerchantDueForSettlement } from "../settlementBatch.service";


// Helper: build a Date at a specific UTC weekday
// JS Date months are 0-indexed; 2025-01-05 is a Sunday (day=0)
const SUNDAY = new Date("2025-01-05T00:00:00Z"); // UTCDay = 0
const MONDAY = new Date("2025-01-06T00:00:00Z"); // UTCDay = 1
const TUESDAY = new Date("2025-01-07T00:00:00Z"); // UTCDay = 2
const WEDNESDAY = new Date("2025-01-08T00:00:00Z"); // UTCDay = 3
const THURSDAY = new Date("2025-01-09T00:00:00Z"); // UTCDay = 4
const FRIDAY = new Date("2025-01-10T00:00:00Z"); // UTCDay = 5
const SATURDAY = new Date("2025-01-11T00:00:00Z"); // UTCDay = 6

describe("isMerchantDueForSettlement", () => {

    // ── daily ──────────────────────────────────────────────────────────────────
    describe("daily schedule", () => {
        it("returns true on every day of the week", () => {
            const days = [SUNDAY, MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY];
            days.forEach((day) => {
                expect(isMerchantDueForSettlement("daily", null, day)).toBe(true);
                expect(isMerchantDueForSettlement("daily", 1, day)).toBe(true); // settlement_day ignored
            });
        });
    });

    // ── weekly ─────────────────────────────────────────────────────────────────
    describe("weekly schedule", () => {
        it("returns true only on the configured day", () => {
            // settlement_day = 1 (Monday)
            expect(isMerchantDueForSettlement("weekly", 1, MONDAY)).toBe(true);
        });

        it("returns false on every other day", () => {
            const notMonday = [SUNDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY];
            notMonday.forEach((day) => {
                expect(isMerchantDueForSettlement("weekly", 1, day)).toBe(false);
            });
        });

        it("handles Sunday (0) correctly", () => {
            expect(isMerchantDueForSettlement("weekly", 0, SUNDAY)).toBe(true);
            expect(isMerchantDueForSettlement("weekly", 0, MONDAY)).toBe(false);
        });

        it("handles Saturday (6) correctly", () => {
            expect(isMerchantDueForSettlement("weekly", 6, SATURDAY)).toBe(true);
            expect(isMerchantDueForSettlement("weekly", 6, FRIDAY)).toBe(false);
        });

        it("returns false and warns when settlement_day is null (misconfigured)", () => {
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => { });
            expect(isMerchantDueForSettlement("weekly", null, MONDAY)).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("no settlement_day set"),
            );
            warnSpy.mockRestore();
        });
    });

    // ── unknown schedule ───────────────────────────────────────────────────────
    describe("unknown schedule", () => {
        it("returns false and warns", () => {
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => { });
            expect(isMerchantDueForSettlement("biweekly", null, MONDAY)).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Unknown settlement_schedule"),
            );
            warnSpy.mockRestore();
        });
    });
});