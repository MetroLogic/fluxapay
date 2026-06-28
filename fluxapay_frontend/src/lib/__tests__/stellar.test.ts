import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStellarNetwork,
  getStellarExpertTxUrl,
  shouldOpenInNewTab,
} from "@/lib/stellar";

describe("stellar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    delete process.env.NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB;
  });

  describe("getStellarNetwork", () => {
    it("defaults to testnet when env var not set", () => {
      expect(getStellarNetwork()).toBe("testnet");
    });

    it("returns public when NEXT_PUBLIC_STELLAR_NETWORK is public", () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "public";
      expect(getStellarNetwork()).toBe("public");
    });

    it("returns testnet when NEXT_PUBLIC_STELLAR_NETWORK is testnet", () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
      expect(getStellarNetwork()).toBe("testnet");
    });

    it("defaults to testnet for invalid env values", () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "invalid";
      expect(getStellarNetwork()).toBe("testnet");
    });

    it("is case-insensitive", () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "PUBLIC";
      expect(getStellarNetwork()).toBe("public");
    });
  });

  describe("getStellarExpertTxUrl", () => {
    it("builds testnet URL when network defaults to testnet", () => {
      const url = getStellarExpertTxUrl("abc123");
      expect(url).toBe("https://stellar.expert/explorer/testnet/tx/abc123");
    });

    it("builds public URL when NEXT_PUBLIC_STELLAR_NETWORK is public", () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "public";
      const url = getStellarExpertTxUrl("abc123");
      expect(url).toBe("https://stellar.expert/explorer/public/tx/abc123");
    });

    it("uses network prop to override env default", () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
      const url = getStellarExpertTxUrl("abc123", "public");
      expect(url).toBe("https://stellar.expert/explorer/public/tx/abc123");
    });

    it("respects network prop even when env is public", () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "public";
      const url = getStellarExpertTxUrl("abc123", "testnet");
      expect(url).toBe("https://stellar.expert/explorer/testnet/tx/abc123");
    });

    it("handles long transaction hashes", () => {
      const longHash =
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const url = getStellarExpertTxUrl(longHash, "public");
      expect(url).toContain(longHash);
      expect(url).toBe(
        `https://stellar.expert/explorer/public/tx/${longHash}`
      );
    });
  });

  describe("shouldOpenInNewTab", () => {
    it("defaults to true when env var not set", () => {
      expect(shouldOpenInNewTab()).toBe(true);
    });

    it("defaults to true when env var is empty string", () => {
      process.env.NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB = "";
      expect(shouldOpenInNewTab()).toBe(true);
    });

    it("returns false when env var is false", () => {
      process.env.NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB = "false";
      expect(shouldOpenInNewTab()).toBe(false);
    });

    it("returns false when env var is FALSE (case-insensitive)", () => {
      process.env.NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB = "FALSE";
      expect(shouldOpenInNewTab()).toBe(false);
    });

    it("returns true for any truthy value", () => {
      process.env.NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB = "true";
      expect(shouldOpenInNewTab()).toBe(true);

      process.env.NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB = "1";
      expect(shouldOpenInNewTab()).toBe(true);
    });
  });
});
