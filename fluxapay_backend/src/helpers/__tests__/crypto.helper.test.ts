import {
  generateApiKey,
  generateWebhookSecret,
  hashKey,
  compareKeys,
  getLastFour,
} from "../crypto.helper";

describe("crypto.helper", () => {
  describe("generateApiKey", () => {
    it("should generate a key with sk_live_ prefix", () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sk_live_[a-f0-9]{32}$/);
    });

    it("should generate unique keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe("generateWebhookSecret", () => {
    it("should generate a secret with whsec_ prefix", () => {
      const secret = generateWebhookSecret();
      expect(secret).toMatch(/^whsec_[a-f0-9]{32}$/);
    });
  });

  describe("hashKey and compareKeys", () => {
    it("should hash a key and correctly compare it", async () => {
      const key = "my_secret_key";
      const hashed = await hashKey(key);
      expect(hashed).not.toBe(key);

      const isMatch = await compareKeys(key, hashed);
      expect(isMatch).toBe(true);

      const isNotMatch = await compareKeys("wrong_key", hashed);
      expect(isNotMatch).toBe(false);
    });
  });

  describe("getLastFour", () => {
    it("should return the last four characters", () => {
      const key = "sk_live_1234567890abcdef";
      expect(getLastFour(key)).toBe("cdef");
    });
  });
});
