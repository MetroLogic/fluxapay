import { describe, expect, it } from "vitest";
import {
  validateBusinessRegistration,
  getRegistrationFormat,
  hasRegistrationValidation,
  BUSINESS_REGISTRATION_PATTERNS,
} from "./businessRegistrationValidation";

describe("businessRegistrationValidation", () => {
  describe("BUSINESS_REGISTRATION_PATTERNS", () => {
    it("includes top 10 markets", () => {
      const expectedCountries = ["NG", "KE", "ZA", "GH", "GB", "US", "CA", "DE", "FR", "IN"];
      expectedCountries.forEach((code) => {
        expect(BUSINESS_REGISTRATION_PATTERNS[code]).toBeDefined();
      });
      expect(Object.keys(BUSINESS_REGISTRATION_PATTERNS)).toHaveLength(10);
    });

    it("each pattern has required fields", () => {
      Object.values(BUSINESS_REGISTRATION_PATTERNS).forEach((format) => {
        expect(format.country).toBeTruthy();
        expect(format.countryCode).toBeTruthy();
        expect(format.pattern).toBeInstanceOf(RegExp);
        expect(format.format).toBeTruthy();
        expect(format.example).toBeTruthy();
      });
    });
  });

  describe("validateBusinessRegistration", () => {
    describe("Nigeria (NG)", () => {
      it("accepts valid RC numbers", () => {
        expect(validateBusinessRegistration("RC123456", "NG")).toEqual({ valid: true });
        expect(validateBusinessRegistration("RC1234567", "NG")).toEqual({ valid: true });
        expect(validateBusinessRegistration("rc123456", "NG")).toEqual({ valid: true });
        expect(validateBusinessRegistration("RC 123456", "NG")).toEqual({ valid: true });
      });

      it("rejects invalid RC numbers", () => {
        const result = validateBusinessRegistration("RC12345", "NG");
        expect(result.valid).toBe(false);
        expect(result.message).toContain("Nigeria");
      });
    });

    describe("Kenya (KE)", () => {
      it("accepts valid certificate numbers", () => {
        expect(validateBusinessRegistration("CPR/2020/123456", "KE")).toEqual({ valid: true });
        expect(validateBusinessRegistration("PVT-A1B2C3D4", "KE")).toEqual({ valid: true });
        expect(validateBusinessRegistration("cpr/2020/12345678", "KE")).toEqual({ valid: true });
      });

      it("rejects invalid certificate numbers", () => {
        const result = validateBusinessRegistration("KE123456", "KE");
        expect(result.valid).toBe(false);
        expect(result.message).toContain("Kenya");
      });
    });

    describe("South Africa (ZA)", () => {
      it("accepts valid CIPC numbers", () => {
        expect(validateBusinessRegistration("2020/123456/07", "ZA")).toEqual({ valid: true });
        expect(validateBusinessRegistration("1999/999999/23", "ZA")).toEqual({ valid: true });
      });

      it("rejects invalid CIPC numbers", () => {
        const result = validateBusinessRegistration("2020-123456-07", "ZA");
        expect(result.valid).toBe(false);
        expect(result.message).toContain("South Africa");
      });
    });

    describe("Ghana (GH)", () => {
      it("accepts valid registration numbers", () => {
        expect(validateBusinessRegistration("CS123456789", "GH")).toEqual({ valid: true });
        expect(validateBusinessRegistration("BN123456789012", "GH")).toEqual({ valid: true });
        expect(validateBusinessRegistration("cs123456789", "GH")).toEqual({ valid: true });
      });

      it("rejects invalid registration numbers", () => {
        const result = validateBusinessRegistration("GH12345", "GH");
        expect(result.valid).toBe(false);
      });
    });

    describe("United Kingdom (GB)", () => {
      it("accepts valid Companies House numbers", () => {
        expect(validateBusinessRegistration("12345678", "GB")).toEqual({ valid: true });
        expect(validateBusinessRegistration("AB123456", "GB")).toEqual({ valid: true });
        expect(validateBusinessRegistration("SC12345A", "GB")).toEqual({ valid: true });
      });

      it("rejects invalid Companies House numbers", () => {
        const result = validateBusinessRegistration("1234567", "GB");
        expect(result.valid).toBe(false);
      });
    });

    describe("United States (US)", () => {
      it("accepts valid EIN numbers", () => {
        expect(validateBusinessRegistration("12-3456789", "US")).toEqual({ valid: true });
        expect(validateBusinessRegistration("123456789", "US")).toEqual({ valid: true });
      });

      it("rejects invalid EIN numbers", () => {
        const result = validateBusinessRegistration("12-345678", "US");
        expect(result.valid).toBe(false);
      });
    });

    describe("Canada (CA)", () => {
      it("accepts valid Business Numbers", () => {
        expect(validateBusinessRegistration("123456789RP0001", "CA")).toEqual({ valid: true });
        expect(validateBusinessRegistration("987654321RC1234", "CA")).toEqual({ valid: true });
        expect(validateBusinessRegistration("123456789rt0001", "CA")).toEqual({ valid: true });
      });

      it("rejects invalid Business Numbers", () => {
        const result = validateBusinessRegistration("12345678", "CA");
        expect(result.valid).toBe(false);
      });
    });

    describe("Germany (DE)", () => {
      it("accepts valid Handelsregister numbers", () => {
        expect(validateBusinessRegistration("HRB12345", "DE")).toEqual({ valid: true });
        expect(validateBusinessRegistration("HRA 1234", "DE")).toEqual({ valid: true });
        expect(validateBusinessRegistration("hrb123456", "DE")).toEqual({ valid: true });
      });

      it("rejects invalid Handelsregister numbers", () => {
        const result = validateBusinessRegistration("HRB12", "DE");
        expect(result.valid).toBe(false);
      });
    });

    describe("France (FR)", () => {
      it("accepts valid SIREN numbers", () => {
        expect(validateBusinessRegistration("123456789", "FR")).toEqual({ valid: true });
        expect(validateBusinessRegistration("987654321", "FR")).toEqual({ valid: true });
      });

      it("rejects invalid SIREN numbers", () => {
        const result = validateBusinessRegistration("12345678", "FR");
        expect(result.valid).toBe(false);
      });
    });

    describe("India (IN)", () => {
      it("accepts valid CIN numbers", () => {
        expect(validateBusinessRegistration("U12345AB2020PLC123456", "IN")).toEqual({ valid: true });
        expect(validateBusinessRegistration("L67890CD2019PTC654321", "IN")).toEqual({ valid: true });
        expect(validateBusinessRegistration("u12345ab2020plc123456", "IN")).toEqual({ valid: true });
      });

      it("rejects invalid CIN numbers", () => {
        const result = validateBusinessRegistration("U12345", "IN");
        expect(result.valid).toBe(false);
      });
    });

    describe("Edge cases", () => {
      it("allows empty registration number", () => {
        expect(validateBusinessRegistration("", "NG")).toEqual({ valid: true });
        expect(validateBusinessRegistration("   ", "NG")).toEqual({ valid: true });
      });

      it("allows any format for unsupported countries", () => {
        expect(validateBusinessRegistration("ANYTHING123", "XX")).toEqual({ valid: true });
        expect(validateBusinessRegistration("Random-Text", "UNKNOWN")).toEqual({ valid: true });
      });

      it("handles case-insensitive country codes", () => {
        expect(validateBusinessRegistration("RC123456", "ng")).toEqual({ valid: true });
        expect(validateBusinessRegistration("RC123456", "Ng")).toEqual({ valid: true });
      });

      it("trims whitespace from registration number", () => {
        expect(validateBusinessRegistration("  RC123456  ", "NG")).toEqual({ valid: true });
      });
    });
  });

  describe("getRegistrationFormat", () => {
    it("returns format description for supported country", () => {
      const format = getRegistrationFormat("NG");
      expect(format).toContain("RC");
      expect(format).toContain("6-7 digits");
    });

    it("returns null for unsupported country", () => {
      expect(getRegistrationFormat("XX")).toBeNull();
    });

    it("handles case-insensitive country codes", () => {
      expect(getRegistrationFormat("ng")).toBeTruthy();
      expect(getRegistrationFormat("NG")).toBeTruthy();
    });
  });

  describe("hasRegistrationValidation", () => {
    it("returns true for supported countries", () => {
      expect(hasRegistrationValidation("NG")).toBe(true);
      expect(hasRegistrationValidation("KE")).toBe(true);
      expect(hasRegistrationValidation("US")).toBe(true);
    });

    it("returns false for unsupported countries", () => {
      expect(hasRegistrationValidation("XX")).toBe(false);
      expect(hasRegistrationValidation("INVALID")).toBe(false);
    });

    it("handles case-insensitive country codes", () => {
      expect(hasRegistrationValidation("ng")).toBe(true);
      expect(hasRegistrationValidation("Ng")).toBe(true);
    });
  });
});
