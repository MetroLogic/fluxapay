import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { signTestToken } from '../helpers/auth';

describe('Merchant KYC verification workflow', () => {
  let merchantId: string;
  let merchantToken: string;
  let adminToken: string;
  let kycId: string;

  beforeAll(async () => {
    adminToken = signTestToken({ sub: 'admin-test', role: 'ADMIN' });
  });

  beforeEach(async () => {
    const merchant = await prisma.merchant.create({
      data: {
        email: `kyc-merchant-${Date.now()}@example.com`,
        name: 'KYC Test Merchant',
        tier: 'STANDARD',
      },
    });
    merchantId = merchant.id;
    merchantToken = signTestToken({ sub: merchantId, role: 'MERCHANT' });
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { merchantId } });
    await prisma.kycDocument.deleteMany({ where: { kyc: { merchantId } } });
    await prisma.kycProfile.deleteMany({ where: { merchantId } });
    await prisma.merchant.deleteMany({ where: { id: merchantId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function submitKyc() {
    const res = await request(app)
      .post('/v1/merchants/kyc')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({
        businessName: 'KYC Test Merchant',
        businessType: 'LLC',
        country: 'US',
        documents: [
          { type: 'BUSINESS_LICENSE', url: 'https://example.com/license.pdf' },
          { type: 'ID_PROOF', url: 'https://example.com/id.pdf' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('UNDER_REVIEW');
    kycId = res.body.id;
    return res;
  }

  it('submits KYC and moves status to UNDER_REVIEW', async () => {
    await submitKyc();

    const stored = await prisma.kycProfile.findUnique({ where: { id: kycId } });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('UNDER_REVIEW');

    const docs = await prisma.kycDocument.findMany({ where: { kycId } });
    expect(docs).toHaveLength(2);
  });

  it('approves KYC, upgrades merchant tier, and writes an audit log', async () => {
    await submitKyc();

    const res = await request(app)
      .post(`/v1/admin/kyc/${kycId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');

    const kyc = await prisma.kycProfile.findUnique({ where: { id: kycId } });
    expect(kyc?.status).toBe('APPROVED');

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    expect(merchant?.tier).toBe('VERIFIED');

    const audit = await prisma.auditLog.findFirst({
      where: { merchantId, action: 'KYC_APPROVED' },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects KYC and keeps merchant tier unchanged', async () => {
    await submitKyc();

    const res = await request(app)
      .post(`/v1/admin/kyc/${kycId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Documents illegible' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');

    const kyc = await prisma.kycProfile.findUnique({ where: { id: kycId } });
    expect(kyc?.status).toBe('REJECTED');

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    expect(merchant?.tier).toBe('STANDARD');

    const audit = await prisma.auditLog.findFirst({
      where: { merchantId, action: 'KYC_REJECTED' },
    });
    expect(audit).not.toBeNull();
  });
});
