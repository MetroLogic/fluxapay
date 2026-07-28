const mockDeleteMany = jest.fn();
const mockFindUnique = jest.fn();

jest.mock('../../generated/client/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    oTP: { deleteMany: mockDeleteMany, findUnique: mockFindUnique },
  })),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

import { verifyOtp } from '../otp.service';

describe('verifyOtp E2E bypass', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, E2E_ACCEPT_OTP: 'test-otp' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts the configured bypass only in the test environment', async () => {
    process.env.NODE_ENV = 'test';

    await expect(verifyOtp('merchant-1', 'email', 'test-otp')).resolves.toEqual({ success: true });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { merchantId: 'merchant-1', channel: 'email' } });
  });

  it.each(['development', 'production'])('does not accept the configured bypass in %s', async (nodeEnv) => {
    process.env.NODE_ENV = nodeEnv;
    mockFindUnique.mockResolvedValue(null);

    await expect(verifyOtp('merchant-1', 'email', 'test-otp')).resolves.toEqual({
      success: false,
      message: 'OTP not found',
    });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
