import { PrismaClient } from '../../generated/client/client';
import { createCustomerService } from '../../services/customer.service';

const prisma = new PrismaClient();

describe('customer service deduplication', () => {
  beforeAll(async () => {
    await prisma.$connect();
    // Use a test merchant
    const merchant = await prisma.merchant.create({
      data: {
        email: 'test-dedup@example.com',
        business_name: 'Dedup Test',
        phone_number: `+1555123${String(Date.now()).slice(-4)}`,
        country: 'US',
        settlement_currency: 'USD',
        webhook_secret: 'whsec_test',
        password: 'hashed',
        status: 'active',
      },
    });
    (global as any).testMerchantId = merchant.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.customer.deleteMany({ where: { merchantId: (global as any).testMerchantId } });
    await prisma.merchant.deleteMany({ where: { email: 'test-dedup@example.com' } });
    await prisma.$disconnect();
  });

  it('should upsert customers and avoid duplicates', async () => {
    const merchantId = (global as any).testMerchantId;

    const a = await createCustomerService({ merchantId, email: 'dup@example.com', name: 'First' });
    const b = await createCustomerService({ merchantId, email: 'dup@example.com', name: 'Second' });

    expect(a.id).toBeDefined();
    expect(b.id).toBeDefined();
    expect(a.id).toEqual(b.id);
  });
});
