import { DepositAddressService } from '../depositAddress.service';
import { PrismaClient } from '../../generated/client/client';

const prisma = new PrismaClient();

describe('DepositAddressService', () => {
  beforeAll(async () => {
    // Clean up before tests
    await prisma.depositAddress.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.depositAddress.deleteMany({});
  });

  describe('generatePoolAddresses', () => {
    it('should generate specified number of addresses', async () => {
      const count = 5;
      const generated = await DepositAddressService.generatePoolAddresses(count);

      expect(generated).toBe(count);

      const addresses = await prisma.depositAddress.findMany({
        where: { status: 'available' },
      });
      expect(addresses.length).toBe(count);
    });

    it('should create addresses with available status', async () => {
      await DepositAddressService.generatePoolAddresses(3);

      const addresses = await prisma.depositAddress.findMany({});
      expect(addresses.every((a) => a.status === 'available')).toBe(true);
    });

    it('should encrypt secret keys', async () => {
      await DepositAddressService.generatePoolAddresses(1);

      const address = await prisma.depositAddress.findFirst({});
      expect(address?.secret_key).toBeTruthy();
      // Secret key should be encrypted (contain colons for IV:TAG:CIPHERTEXT format)
      expect(address?.secret_key).toContain(':');
    });

    it('should generate unique public keys', async () => {
      await DepositAddressService.generatePoolAddresses(10);

      const addresses = await prisma.depositAddress.findMany({});
      const publicKeys = addresses.map((a) => a.public_key);
      const uniqueKeys = new Set(publicKeys);

      expect(uniqueKeys.size).toBe(10);
    });
  });

  describe('allocateAddress', () => {
    it('should allocate available address to payment', async () => {
      await DepositAddressService.generatePoolAddresses(1);

      const paymentId = 'payment-123';
      const publicKey = await DepositAddressService.allocateAddress(paymentId);

      expect(publicKey).toBeTruthy();

      const address = await prisma.depositAddress.findUnique({
        where: { public_key: publicKey! },
      });

      expect(address?.status).toBe('assigned');
      expect(address?.assigned_payment_id).toBe(paymentId);
    });

    it('should return null when no addresses available', async () => {
      const paymentId = 'payment-123';
      const publicKey = await DepositAddressService.allocateAddress(paymentId);

      expect(publicKey).toBeNull();
    });

    it('should allocate different addresses for different payments', async () => {
      await DepositAddressService.generatePoolAddresses(2);

      const payment1 = await DepositAddressService.allocateAddress('payment-1');
      const payment2 = await DepositAddressService.allocateAddress('payment-2');

      expect(payment1).not.toBe(payment2);
    });

    it('should handle concurrent allocation with row-level locking', async () => {
      await DepositAddressService.generatePoolAddresses(1);

      const promises = [
        DepositAddressService.allocateAddress('payment-1'),
        DepositAddressService.allocateAddress('payment-2'),
      ];

      const results = await Promise.all(promises);

      // Only one should succeed, one should get null
      const successful = results.filter((r) => r !== null);
      const failed = results.filter((r) => r === null);

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);
    });
  });

  describe('releaseAddress', () => {
    it('should move address to cooldown status', async () => {
      await DepositAddressService.generatePoolAddresses(1);
      const paymentId = 'payment-123';
      await DepositAddressService.allocateAddress(paymentId);

      await DepositAddressService.releaseAddress(paymentId);

      const address = await prisma.depositAddress.findFirst({
        where: { assigned_payment_id: paymentId },
      });

      expect(address?.status).toBe('cooldown');
      expect(address?.cooldown_until).toBeTruthy();
      expect(address?.assigned_payment_id).toBeNull();
    });

    it('should set 24-hour cooldown period', async () => {
      await DepositAddressService.generatePoolAddresses(1);
      const paymentId = 'payment-123';
      await DepositAddressService.allocateAddress(paymentId);

      const beforeRelease = new Date();
      await DepositAddressService.releaseAddress(paymentId);
      const afterRelease = new Date();

      const address = await prisma.depositAddress.findFirst({
        where: { assigned_payment_id: paymentId },
      });

      const cooldownDuration = address!.cooldown_until!.getTime() - beforeRelease.getTime();
      const expectedDuration = 24 * 60 * 60 * 1000;
      const tolerance = 5000; // 5 second tolerance

      expect(Math.abs(cooldownDuration - expectedDuration)).toBeLessThan(tolerance);
    });

    it('should handle release of unassigned payment gracefully', async () => {
      await expect(
        DepositAddressService.releaseAddress('non-existent-payment')
      ).resolves.not.toThrow();
    });
  });

  describe('getPoolStats', () => {
    it('should return correct pool statistics', async () => {
      // Create pool with different statuses
      await DepositAddressService.generatePoolAddresses(5);

      const payment1 = 'payment-1';
      const payment2 = 'payment-2';

      await DepositAddressService.allocateAddress(payment1);
      await DepositAddressService.allocateAddress(payment2);

      await DepositAddressService.releaseAddress(payment1);

      const stats = await DepositAddressService.getPoolStats();

      expect(stats.available).toBe(3);
      expect(stats.assigned).toBe(1);
      expect(stats.cooldown).toBe(1);
      expect(stats.total).toBe(5);
    });

    it('should return zero counts for empty pool', async () => {
      const stats = await DepositAddressService.getPoolStats();

      expect(stats.available).toBe(0);
      expect(stats.assigned).toBe(0);
      expect(stats.cooldown).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('recycleAddresses', () => {
    it('should move expired cooldown addresses back to available', async () => {
      await DepositAddressService.generatePoolAddresses(1);
      const paymentId = 'payment-123';

      await DepositAddressService.allocateAddress(paymentId);
      await DepositAddressService.releaseAddress(paymentId);

      // Move cooldown_until to the past
      const address = await prisma.depositAddress.findFirst({
        where: { status: 'cooldown' },
      });

      await prisma.depositAddress.update({
        where: { id: address!.id },
        data: {
          cooldown_until: new Date(Date.now() - 1000), // 1 second in the past
        },
      });

      const recycled = await DepositAddressService.recycleAddresses();

      expect(recycled).toBe(1);

      const recycledAddress = await prisma.depositAddress.findUnique({
        where: { id: address!.id },
      });

      expect(recycledAddress?.status).toBe('available');
      expect(recycledAddress?.cooldown_until).toBeNull();
    });

    it('should not recycle addresses with future cooldown_until', async () => {
      await DepositAddressService.generatePoolAddresses(1);
      const paymentId = 'payment-123';

      await DepositAddressService.allocateAddress(paymentId);
      await DepositAddressService.releaseAddress(paymentId);

      // cooldown_until is in the future by default
      const recycled = await DepositAddressService.recycleAddresses();

      expect(recycled).toBe(0);

      const address = await prisma.depositAddress.findFirst({
        where: { status: 'cooldown' },
      });

      expect(address?.status).toBe('cooldown');
    });

    it('should recycle multiple expired addresses', async () => {
      await DepositAddressService.generatePoolAddresses(3);

      const paymentIds = ['payment-1', 'payment-2', 'payment-3'];

      for (const paymentId of paymentIds) {
        await DepositAddressService.allocateAddress(paymentId);
        await DepositAddressService.releaseAddress(paymentId);
      }

      // Move all to expired cooldown
      await prisma.depositAddress.updateMany({
        where: { status: 'cooldown' },
        data: {
          cooldown_until: new Date(Date.now() - 1000),
        },
      });

      const recycled = await DepositAddressService.recycleAddresses();

      expect(recycled).toBe(3);

      const stats = await DepositAddressService.getPoolStats();
      expect(stats.available).toBe(3);
      expect(stats.cooldown).toBe(0);
    });
  });

  describe('End-to-end workflow', () => {
    it('should complete full lifecycle: generate → allocate → release → recycle', async () => {
      // Step 1: Generate pool
      await DepositAddressService.generatePoolAddresses(5);
      let stats = await DepositAddressService.getPoolStats();
      expect(stats.available).toBe(5);

      // Step 2: Allocate address
      const paymentId = 'payment-123';
      const publicKey = await DepositAddressService.allocateAddress(paymentId);
      expect(publicKey).toBeTruthy();

      stats = await DepositAddressService.getPoolStats();
      expect(stats.available).toBe(4);
      expect(stats.assigned).toBe(1);

      // Step 3: Release address (payment completed)
      await DepositAddressService.releaseAddress(paymentId);
      stats = await DepositAddressService.getPoolStats();
      expect(stats.assigned).toBe(0);
      expect(stats.cooldown).toBe(1);

      // Step 4: Fast-forward cooldown
      const cooldownAddress = await prisma.depositAddress.findFirst({
        where: { status: 'cooldown' },
      });

      await prisma.depositAddress.update({
        where: { id: cooldownAddress!.id },
        data: { cooldown_until: new Date(Date.now() - 1000) },
      });

      // Step 5: Recycle addresses
      const recycled = await DepositAddressService.recycleAddresses();
      expect(recycled).toBe(1);

      stats = await DepositAddressService.getPoolStats();
      expect(stats.available).toBe(5);
      expect(stats.cooldown).toBe(0);
    });
  });
});
