import { LocalKMSProvider } from '../kms/LocalKMSProvider';
import { KMSFactory } from '../kms/KMSFactory';
import { HDWalletService } from '../HDWalletService';

describe('KMS Integration Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    KMSFactory.reset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('LocalKMSProvider', () => {
    it('should encrypt and decrypt master seed correctly', async () => {
      const passphrase = 'test-passphrase-123';
      const masterSeed = 'my-super-secret-master-seed-12345678';

      const kms = new LocalKMSProvider(passphrase);

      // Encrypt
      await kms.storeMasterSeed(masterSeed);

      // Decrypt
      const decrypted = await kms.getMasterSeed();

      expect(decrypted).toBe(masterSeed);
    });

    it('should fail to decrypt with wrong passphrase', async () => {
      const correctPassphrase = 'correct-passphrase';
      const wrongPassphrase = 'wrong-passphrase';
      const masterSeed = 'my-super-secret-master-seed-12345678';

      // Encrypt with correct passphrase
      const kms1 = new LocalKMSProvider(correctPassphrase);
      await kms1.storeMasterSeed(masterSeed);
      const encrypted = await kms1.getMasterSeed();

      // Try to decrypt with wrong passphrase
      process.env.KMS_ENCRYPTED_MASTER_SEED = encrypted;
      const kms2 = new LocalKMSProvider(wrongPassphrase);

      await expect(kms2.getMasterSeed()).rejects.toThrow();
    });

    it('should cache decrypted seed', async () => {
      const passphrase = 'test-passphrase';
      const masterSeed = 'my-master-seed-12345678';

      const kms = new LocalKMSProvider(passphrase);
      await kms.storeMasterSeed(masterSeed);

      // First call
      const seed1 = await kms.getMasterSeed();
      // Second call (should be cached)
      const seed2 = await kms.getMasterSeed();

      expect(seed1).toBe(seed2);
      expect(seed1).toBe(masterSeed);
    });

    it('should pass health check', async () => {
      const kms = new LocalKMSProvider('test-passphrase');
      const healthy = await kms.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe('KMSFactory', () => {
    it('should create LocalKMSProvider by default', () => {
      process.env.KMS_PROVIDER = 'local';
      const provider = KMSFactory.getProvider();
      expect(provider).toBeInstanceOf(LocalKMSProvider);
    });

    it('should create LocalKMSProvider when not specified', () => {
      delete process.env.KMS_PROVIDER;
      const provider = KMSFactory.getProvider();
      expect(provider).toBeInstanceOf(LocalKMSProvider);
    });

    it('should return singleton instance', () => {
      process.env.KMS_PROVIDER = 'local';
      const provider1 = KMSFactory.getProvider();
      const provider2 = KMSFactory.getProvider();
      expect(provider1).toBe(provider2);
    });

    it('should reset singleton', () => {
      process.env.KMS_PROVIDER = 'local';
      const provider1 = KMSFactory.getProvider();
      KMSFactory.reset();
      const provider2 = KMSFactory.getProvider();
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('HDWalletService with KMS', () => {
    it('should derive addresses using KMS-backed seed', async () => {
      const masterSeed = 'test-master-seed-for-kms-12345678';
      const passphrase = 'test-passphrase';

      // Set up Local KMS and get encrypted seed
      const kms = new LocalKMSProvider(passphrase);
      const encrypted = kms['encrypt'](masterSeed); // Access private method for testing

      process.env.KMS_PROVIDER = 'local';
      process.env.KMS_ENCRYPTION_PASSPHRASE = passphrase;
      process.env.KMS_ENCRYPTED_MASTER_SEED = encrypted;

      KMSFactory.reset();

      // Create HDWalletService with KMS
      const hdWallet = new HDWalletService();

      // Derive address
      const address = await hdWallet.derivePaymentAddress('merchant_1', 'payment_1');

      expect(address).toMatch(/^G[A-Z0-9]{55}$/);
    });

    it('should derive same addresses with KMS as with direct seed', async () => {
      const masterSeed = 'test-master-seed-12345678';
      const merchantId = 'merchant_test';
      const paymentId = 'payment_test';

      // Direct seed injection
      const hdWalletDirect = new HDWalletService(masterSeed);
      const addressDirect = await hdWalletDirect.derivePaymentAddress(merchantId, paymentId);

      // KMS-backed
      const passphrase = 'test-passphrase';
      const kms = new LocalKMSProvider(passphrase);
      await kms.storeMasterSeed(masterSeed);

      const hdWalletKMS = new HDWalletService(kms);
      const addressKMS = await hdWalletKMS.derivePaymentAddress(merchantId, paymentId);

      expect(addressKMS).toBe(addressDirect);
    });

    it('should regenerate keypairs using KMS', async () => {
      const masterSeed = 'test-master-seed-12345678';
      const kms = new LocalKMSProvider('test-passphrase');
      await kms.storeMasterSeed(masterSeed);

      const hdWallet = new HDWalletService(kms);
      const { publicKey, secretKey } = await hdWallet.regenerateKeypair('merchant_1', 'payment_1');

      expect(publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it('should verify addresses using KMS', async () => {
      const masterSeed = 'test-master-seed-12345678';
      const kms = new LocalKMSProvider('test-passphrase');
      await kms.storeMasterSeed(masterSeed);

      const hdWallet = new HDWalletService(kms);
      const merchantId = 'merchant_1';
      const paymentId = 'payment_1';

      const address = await hdWallet.derivePaymentAddress(merchantId, paymentId);
      const isValid = await hdWallet.verifyAddress(merchantId, paymentId, address);

      expect(isValid).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy HD_WALLET_MASTER_SEED', async () => {
      const masterSeed = 'legacy-master-seed-12345678';
      process.env.HD_WALLET_MASTER_SEED = masterSeed;
      delete process.env.KMS_ENCRYPTED_MASTER_SEED;

      const kms = new LocalKMSProvider();
      const decrypted = await kms.getMasterSeed();

      expect(decrypted).toBe(masterSeed);
    });

    it('should prefer KMS_ENCRYPTED_MASTER_SEED over HD_WALLET_MASTER_SEED', async () => {
      const legacySeed = 'legacy-seed';
      const kmsSeed = 'kms-seed-12345678';
      const passphrase = 'test-passphrase';

      // Set up both
      process.env.HD_WALLET_MASTER_SEED = legacySeed;

      const kms = new LocalKMSProvider(passphrase);
      const encrypted = kms['encrypt'](kmsSeed); // Access private method for testing

      process.env.KMS_ENCRYPTED_MASTER_SEED = encrypted;
      process.env.KMS_ENCRYPTION_PASSPHRASE = passphrase;

      const kms2 = new LocalKMSProvider(passphrase);
      const decrypted = await kms2.getMasterSeed();

      expect(decrypted).toBe(kmsSeed);
      expect(decrypted).not.toBe(legacySeed);
    });
  });
});
