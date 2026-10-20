import { LocalKMSProvider } from "../kms/LocalKMSProvider";
import { needsReencryption, parseEnvelope } from "../kms/keyVersioning";

describe("KMS key rotation", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("encrypts with a version prefix and round-trips", async () => {
    process.env.KMS_ENCRYPTION_PASSPHRASE = "p1";
    const kms = new LocalKMSProvider();
    const ct = await kms.encrypt("secret");
    expect(ct.startsWith("v1$")).toBe(true);
    expect(await kms.decrypt(ct)).toBe("secret");
  });

  it("decrypts legacy unversioned ciphertext as v1", async () => {
    process.env.KMS_ENCRYPTION_PASSPHRASE = "p1";
    const kms = new LocalKMSProvider();
    const legacy = parseEnvelope(await kms.encrypt("abc")).body;
    expect(await kms.decrypt(legacy)).toBe("abc");
    expect(needsReencryption(legacy)).toBe(true);
  });

  it("uses the active version and still decrypts old versions", async () => {
    process.env.KMS_ENCRYPTION_PASSPHRASE = "p1";
    process.env.KMS_ENCRYPTION_PASSPHRASE_V2 = "p2";
    const kms = new LocalKMSProvider();
    const old = await kms.encrypt("x");
    process.env.KMS_ACTIVE_KEY_VERSION = "2";
    const fresh = await kms.encrypt("x");
    expect(fresh.startsWith("v2$")).toBe(true);
    expect(await kms.decrypt(old)).toBe("x");
    expect(await kms.decrypt(fresh)).toBe("x");
    expect(needsReencryption(old)).toBe(true);
    expect(needsReencryption(fresh)).toBe(false);
  });
});
