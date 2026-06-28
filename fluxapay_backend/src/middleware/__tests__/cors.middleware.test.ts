const mockMerchantFindMany = jest.fn();

jest.mock('../../generated/client/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => {
      return {
        merchant: {
          findMany: mockMerchantFindMany,
        },
      };
    }),
  };
});

import { getCorsOptions, corsMiddleware } from '../cors.middleware';
import { resetEnvConfig, validateEnv } from '../../config/env.config';

/**
 * Helper function to set up minimal required environment variables for testing
 */
function setupMinimalEnv() {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing';
  process.env.FUNDER_SECRET_KEY = 'SBS_TEST_SECRET_KEY_FOR_TESTING_ONLY_1234567890ABCDEF';
  process.env.USDC_ISSUER_PUBLIC_KEY = 'GBTEST_USDC_ISSUER_PUBLIC_KEY_FOR_TESTING_ONLY_12345';
  process.env.MASTER_VAULT_SECRET_KEY = 'SBS_TEST_VAULT_SECRET_KEY_FOR_TESTING_ONLY_123456789';
  process.env.KMS_ENCRYPTED_MASTER_SEED = 'test-encrypted-master-seed';
}

describe('CORS Middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment config before each test
    jest.resetModules();
    process.env = { ...originalEnv };
    resetEnvConfig();
    jest.clearAllMocks();
    setupMinimalEnv();
    mockMerchantFindMany.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvConfig();
  });

  describe('Development Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.CORS_ORIGINS = '';
    });

    it('should allow localhost origins with explicit ports in development', () => {
      const options = getCorsOptions();
      expect(options.origin).toBeDefined();
      expect(typeof options.origin).toBe('function');

      // Allowed development ports should pass
      const callback = jest.fn();
      (options.origin as Function)('http://localhost:3000', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('http://localhost:8080', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('http://127.0.0.1:4000', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('https://localhost:5173', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should block localhost origins with non-allowed ports in development', () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)('http://localhost:9999', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should block non-localhost origins in development', () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)('https://evil.com', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should allow requests with no origin header in development', () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)(undefined, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should honour CORS_ORIGINS override in development when set', () => {
      process.env.CORS_ORIGINS = 'https://custom-dev-domain.com';
      resetEnvConfig();

      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)('https://custom-dev-domain.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('http://localhost:3000', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  describe('Test Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      process.env.CORS_ORIGINS = '';
    });

    it('should allow wildcard origin in test environment', () => {
      const options = getCorsOptions();
      expect(options.origin).toBe('*');
    });
  });

  describe('Staging Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'staging';
    });

    it('should allow staging domains only in staging', () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)('https://staging.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('https://app.staging.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('https://api.staging.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should block non-staging domains in staging', () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)('https://fluxapay.com', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);

      callback.mockClear();
      (options.origin as Function)('https://evil.com', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should block requests with no origin in staging', () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)(undefined, callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should fail environment validation in staging if CORS_ORIGINS contains wildcard', () => {
      process.env.CORS_ORIGINS = 'https://staging.fluxapay.com,*';
      resetEnvConfig();
      expect(() => validateEnv()).toThrow(/CORS_ORIGINS cannot contain wildcard/);
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should allow app.fluxapay.com and fluxapay.com in production', async () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      await (options.origin as Function)('https://app.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      await (options.origin as Function)('https://fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should allow merchant-registered webhook origins in production', async () => {
      mockMerchantFindMany.mockResolvedValueOnce([
        { webhook_url: 'https://merchant-api.com/v1/webhooks' }
      ]);

      const options = getCorsOptions();
      const callback = jest.fn();

      await (options.origin as Function)('https://merchant-api.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      expect(mockMerchantFindMany).toHaveBeenCalledWith({
        where: {
          webhook_url: {
            startsWith: 'https://merchant-api.com',
          },
        },
        select: {
          webhook_url: true,
        },
      });
    });

    it('should block unregistered origins in production', async () => {
      mockMerchantFindMany.mockResolvedValueOnce([]);

      const options = getCorsOptions();
      const callback = jest.fn();

      await (options.origin as Function)('https://unregistered-domain.com', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should block missing origins in production', async () => {
      const options = getCorsOptions();
      const callback = jest.fn();

      await (options.origin as Function)(undefined, callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should fail environment validation in production if CORS_ORIGINS contains wildcard', () => {
      process.env.CORS_ORIGINS = '*';
      resetEnvConfig();
      expect(() => validateEnv()).toThrow(/CORS_ORIGINS cannot contain wildcard/);
    });
  });
});
