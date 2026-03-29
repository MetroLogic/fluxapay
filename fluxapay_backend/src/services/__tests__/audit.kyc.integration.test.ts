import { PrismaClient, KYCStatus, BusinessType, GovernmentIdType } from '../../generated/client/client';
import { updateKycStatusService } from '../kyc.service';

const prisma = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Audit Logging - KYC Integration', () => {
  let testMerchantId: string;

  beforeEach(async () => {
    // Clean up in FK-dependency order to avoid constraint violations
    await prisma.discrepancyAlert.deleteMany({});
    await prisma.discrepancyThreshold.deleteMany({});
    await prisma.reconciliationRecord.deleteMany({});
    await prisma.refund.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.settlement.deleteMany({});
    await prisma.webhookRetryAttempt.deleteMany({});
    await prisma.webhookLog.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.kYCDocument.deleteMany({});
    await prisma.merchantKYC.deleteMany({});
    await prisma.merchantHDIndex.deleteMany({});
    await prisma.bankAccount.deleteMany({});
    await prisma.merchantSubscription.deleteMany({});
    await prisma.oTP.deleteMany({});
    await prisma.merchant.deleteMany({});

    // Create test merchant
    const merchant = await prisma.merchant.create({
      data: {
        business_name: 'Test Business',
        email: `test-${Date.now()}@example.com`,
        phone_number: `+1234567${Date.now()}`,
        country: 'US',
        settlement_currency: 'USD',
        webhook_secret: 'test-webhook-secret',
        password: 'hashed_password',
      },
    });

    testMerchantId = merchant.id;

    // Create KYC record
    await prisma.merchantKYC.create({
      data: {
        merchantId: testMerchantId,
        business_type: BusinessType.registered_business,
        legal_business_name: 'Test Business LLC',
        country_of_registration: 'US',
        business_address: '123 Test St',
        director_full_name: 'John Doe',
        director_email: 'john@test.com',
        director_phone: '+1234567890',
        government_id_type: GovernmentIdType.passport,
        government_id_number: 'P123456',
        kyc_status: KYCStatus.pending_review,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create audit entry within KYC approval transaction', async () => {
    // Approve KYC
    await updateKycStatusService(
      testMerchantId,
      { status: 'approved' },
      'admin-123'
    );

    // Verify KYC was updated
    const kyc = await prisma.merchantKYC.findUnique({
      where: { merchantId: testMerchantId },
    });

    expect(kyc?.kyc_status).toBe(KYCStatus.approved);
    expect(kyc?.reviewed_by).toBe('admin-123');

    // Verify audit entry was created
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity_id: testMerchantId },
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].admin_id).toBe('admin-123');
    expect(auditLogs[0].action_type).toBe('kyc_approve');
    expect(auditLogs[0].entity_type).toBe('merchant_kyc');
    expect(auditLogs[0].details).toMatchObject({
      merchant_id: testMerchantId,
      previous_status: KYCStatus.pending_review,
      new_status: KYCStatus.approved,
    });
  });

  it('should create audit entry within KYC rejection transaction', async () => {
    // Reject KYC
    await updateKycStatusService(
      testMerchantId,
      { 
        status: 'rejected',
        rejection_reason: 'Incomplete documents'
      },
      'admin-456'
    );

    // Verify KYC was updated
    const kyc = await prisma.merchantKYC.findUnique({
      where: { merchantId: testMerchantId },
    });

    expect(kyc?.kyc_status).toBe(KYCStatus.rejected);
    expect(kyc?.rejection_reason).toBe('Incomplete documents');

    // Verify audit entry was created
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity_id: testMerchantId },
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action_type).toBe('kyc_reject');
    expect(auditLogs[0].details).toMatchObject({
      merchant_id: testMerchantId,
      previous_status: KYCStatus.pending_review,
      new_status: KYCStatus.rejected,
      reason: 'Incomplete documents',
    });
  });

  it('should rollback audit entry if KYC update fails', async () => {
    // Simulate failure by trying to update non-existent merchant
    // kyc.service throws plain objects (not Error instances), use toMatchObject
    await expect(
      updateKycStatusService(
        'non-existent-merchant',
        { status: 'approved' },
        'admin-123'
      )
    ).rejects.toMatchObject({ message: expect.any(String) });

    // Verify no audit entry was created
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity_id: 'non-existent-merchant' },
    });

    expect(auditLogs).toHaveLength(0);
  });

  it('should not allow KYC update if not in pending_review status', async () => {
    // Update KYC to approved first
    await updateKycStatusService(
      testMerchantId,
      { status: 'approved' },
      'admin-123'
    );

    // Try to update again
    // kyc.service throws plain objects (not Error instances), use toMatchObject
    await expect(
      updateKycStatusService(
        testMerchantId,
        { status: 'rejected' },
        'admin-456'
      )
    ).rejects.toMatchObject({ message: 'KYC is not in pending review status' });

    // Verify only one audit entry exists (from first update)
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity_id: testMerchantId },
    });

    expect(auditLogs).toHaveLength(1);
  });

  it('should capture timestamp in audit entry', async () => {
    const beforeUpdate = new Date();

    await updateKycStatusService(
      testMerchantId,
      { status: 'approved' },
      'admin-123'
    );

    const afterUpdate = new Date();

    const auditLogs = await prisma.auditLog.findMany({
      where: { entity_id: testMerchantId },
    });

    expect(auditLogs[0].created_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    expect(auditLogs[0].created_at.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
  });
});
