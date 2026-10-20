import {
  calculateMinimumReserve,
  evaluateReserveStatus,
  ReserveStatus,
} from "./stellarReserveMonitor.service";

describe("calculateMinimumReserve", () => {
  const BASE_RESERVE = 0.5;

  it("computes base reserve for an account with no subentries", () => {
    const reserve = calculateMinimumReserve({
      baseReserve: BASE_RESERVE,
      trustlines: 0,
      signers: 0,
      openOffers: 0,
      buffer: 0,
    });

    // (2 + 0) * 0.5 = 1.0
    expect(reserve).toBeCloseTo(1.0, 7);
  });

  it("accounts for trustlines as subentries", () => {
    const reserve = calculateMinimumReserve({
      baseReserve: BASE_RESERVE,
      trustlines: 3,
      signers: 0,
      openOffers: 0,
      buffer: 0,
    });

    // (2 + 3) * 0.5 = 2.5
    expect(reserve).toBeCloseTo(2.5, 7);
  });

  it("accounts for additional signers as subentries", () => {
    const reserve = calculateMinimumReserve({
      baseReserve: BASE_RESERVE,
      trustlines: 0,
      signers: 2,
      openOffers: 0,
      buffer: 0,
    });

    // (2 + 2) * 0.5 = 2.0
    expect(reserve).toBeCloseTo(2.0, 7);
  });

  it("accounts for open offers as subentries", () => {
    const reserve = calculateMinimumReserve({
      baseReserve: BASE_RESERVE,
      trustlines: 0,
      signers: 0,
      openOffers: 4,
      buffer: 0,
    });

    // (2 + 4) * 0.5 = 3.0
    expect(reserve).toBeCloseTo(3.0, 7);
  });

  it("combines all subentry types and adds the buffer", () => {
    const reserve = calculateMinimumReserve({
      baseReserve: BASE_RESERVE,
      trustlines: 2,
      signers: 1,
      openOffers: 3,
      buffer: 5,
    });

    // (2 + 2 + 1 + 3) * 0.5 + 5 = 4.0 + 5 = 9.0
    expect(reserve).toBeCloseTo(9.0, 7);
  });

  it("scales with a different base reserve", () => {
    const reserve = calculateMinimumReserve({
      baseReserve: 1,
      trustlines: 5,
      signers: 0,
      openOffers: 0,
      buffer: 0,
    });

    // (2 + 5) * 1 = 7
    expect(reserve).toBeCloseTo(7, 7);
  });
});

describe("evaluateReserveStatus", () => {
  const BASE_RESERVE = 0.5;

  it("returns OK when balance comfortably exceeds the reserve", () => {
    const status = evaluateReserveStatus({
      balance: 100,
      baseReserve: BASE_RESERVE,
      trustlines: 1,
      signers: 0,
      openOffers: 0,
      buffer: 1,
      warningThreshold: 5,
    });

    expect(status.level).toBe("ok");
    expect(status.requiredReserve).toBeCloseTo(2.5, 7);
    expect(status.surplus).toBeCloseTo(97.5, 7);
  });

  it("returns warning when surplus falls below the warning threshold", () => {
    const status = evaluateReserveStatus({
      balance: 4,
      baseReserve: BASE_RESERVE,
      trustlines: 1,
      signers: 0,
      openOffers: 0,
      buffer: 1,
      warningThreshold: 5,
    });

    expect(status.level).toBe("warning");
    expect(status.requiredReserve).toBeCloseTo(2.5, 7);
    expect(status.surplus).toBeCloseTo(1.5, 7);
  });

  it("returns critical when balance is below the required reserve", () => {
    const status = evaluateReserveStatus({
      balance: 1,
      baseReserve: BASE_RESERVE,
      trustlines: 3,
      signers: 0,
      openOffers: 0,
      buffer: 1,
      warningThreshold: 5,
    });

    expect(status.level).toBe("critical");
    expect(status.requiredReserve).toBeCloseTo(3.5, 7);
    expect(status.surplus).toBeLessThan(0);
  });

  it("treats balance exactly at the reserve as critical", () => {
    const status = evaluateReserveStatus({
      balance: 2.5,
      baseReserve: BASE_RESERVE,
      trustlines: 1,
      signers: 0,
      openOffers: 0,
      buffer: 1,
      warningThreshold: 5,
    });

    expect(status.level).toBe("critical");
    expect(status.surplus).toBeCloseTo(0, 7);
  });

  it("exposes the computed reserve and surplus on the status object", () => {
    const status: ReserveStatus = evaluateReserveStatus({
      balance: 10,
      baseReserve: BASE_RESERVE,
      trustlines: 2,
      signers: 1,
      openOffers: 0,
      buffer: 2,
      warningThreshold: 5,
    });

    // (2 + 2 + 1) * 0.5 + 2 = 4.5
    expect(status.requiredReserve).toBeCloseTo(4.5, 7);
    expect(status.surplus).toBeCloseTo(5.5, 7);
    expect(status.level).toBe("ok");
  });
});
