import { evaluateSanctions, MockSanctionsProvider } from "./sanctionsScreening.service";

describe("sanctions screening (mock provider)", () => {
  const p = new MockSanctionsProvider();

  it("passes clean entities", async () => {
    const r = await evaluateSanctions({ companyName: "Acme Ltd", directorNames: ["Jane Doe"] }, p);
    expect(r.status).toBe("CLEAR");
  });

  it("flags OFAC keyword hits", async () => {
    const r = await evaluateSanctions({ companyName: "OFAC Trading", directorNames: ["Jane Doe"] }, p);
    expect(r.status).toBe("SANCTIONS_REVIEW_REQUIRED");
    expect(r.result.matches[0].list).toBe("OFAC");
  });

  it("flags PEP director hits", async () => {
    const r = await evaluateSanctions({ companyName: "Acme", directorNames: ["Minister Smith"] }, p);
    expect(r.status).toBe("SANCTIONS_REVIEW_REQUIRED");
    expect(r.result.matches[0].list).toBe("PEP");
  });
});
