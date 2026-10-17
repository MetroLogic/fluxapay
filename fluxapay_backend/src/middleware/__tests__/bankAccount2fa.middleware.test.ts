jest.mock('../../services/otp.service', () => ({
  verifyOtp: jest.fn(),
}));

jest.mock('../../services/audit.service', () => ({
  createAuditLog: jest.fn(),
}));

import { requireBankAccount2FA } from '../bankAccount2fa.middleware';
import { verifyOtp } from '../../services/otp.service';
import { createAuditLog } from '../../services/audit.service';
import { ErrorCode } from '../../types/errors';

const mockedVerifyOtp = verifyOtp as jest.MockedFunction<typeof verifyOtp>;
const mockedCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;

describe('requireBankAccount2FA', () => {
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows the mutation when a valid OTP is present', async () => {
    mockedVerifyOtp.mockResolvedValue({ success: true });

    const req: any = {
      merchantId: 'merchant-123',
      body: { otp: '123456' },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await requireBankAccount2FA(req, res, next);

    expect(mockedVerifyOtp).toHaveBeenCalledWith('merchant-123', 'email', '123456');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects missing OTP requests with a 2FA required error', async () => {
    const req: any = {
      merchantId: 'merchant-123',
      body: {},
      headers: {},
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await requireBankAccount2FA(req, res, next);

    expect(mockedVerifyOtp).not.toHaveBeenCalled();
    expect(mockedCreateAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: ErrorCode.TWO_FACTOR_REQUIRED,
      message: expect.stringContaining('valid verification code'),
    }));
  });

  it('rejects invalid OTP requests and logs the denial', async () => {
    mockedVerifyOtp.mockResolvedValue({ success: false, message: 'Invalid OTP' });

    const req: any = {
      merchantId: 'merchant-123',
      body: { otp: '000000' },
      headers: {},
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await requireBankAccount2FA(req, res, next);

    expect(mockedVerifyOtp).toHaveBeenCalledWith('merchant-123', 'email', '000000');
    expect(mockedCreateAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: ErrorCode.TWO_FACTOR_REQUIRED,
      message: expect.stringContaining('valid verification code'),
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
