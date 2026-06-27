import { isSorobanVerificationEnabled, getSorobanVerificationDefault } from "../../utils/sorobanVerification.util";

describe("sorobanVerification.util", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("defaults to enabled in production when unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_SOROBAN_VERIFICATION;
    expect(isSorobanVerificationEnabled()).toBe(true);
    expect(getSorobanVerificationDefault()).toBe("true");
  });

  it("defaults to disabled in development when unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_SOROBAN_VERIFICATION;
    expect(isSorobanVerificationEnabled()).toBe(false);
    expect(getSorobanVerificationDefault()).toBe("false");
  });

  it("respects explicit ENABLE_SOROBAN_VERIFICATION=false in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_SOROBAN_VERIFICATION = "false";
    expect(isSorobanVerificationEnabled()).toBe(false);
  });

  it("respects explicit ENABLE_SOROBAN_VERIFICATION=true in development", () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_SOROBAN_VERIFICATION = "true";
    expect(isSorobanVerificationEnabled()).toBe(true);
  });
});
