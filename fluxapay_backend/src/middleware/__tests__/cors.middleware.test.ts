import { getCorsOptions, corsMiddleware } from '../cors.middleware';
import { resetEnvConfig } from '../../config/env.config';

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

    it('should allow localhost origins in development', () => {
      const options = getCorsOptions();
      expect(options.origin).toBeDefined();
      expect(typeof options.origin).toBe('function');

      // Standard localhost ports should be allowed
      const callback = jest.fn();
      (options.origin as Function)('http://localhost:3000', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('http://localhost:8080', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('http://127.0.0.1:4000', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
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
      process.env.CORS_ORIGINS = 'https://staging.fluxapay.com';
      resetEnvConfig();

      const options = getCorsOptions();
      const callback = jest.fn();

      (options.origin as Function)('https://staging.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);

      callback.mockClear();
      (options.origin as Function)('http://localhost:3000', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should allow credentials in development', () => {
      const options = getCorsOptions();
      expect(options.credentials).toBe(true);
    });

    it('should include proper methods and headers in development', () => {
      const options = getCorsOptions();
      expect(options.methods).toEqual([
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS'
      ]);
      expect(options.allowedHeaders).toContain('Content-Type');
      expect(options.allowedHeaders).toContain('Authorization');
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

    it('should include proper methods and headers in test', () => {
      const options = getCorsOptions();
      expect(options.methods).toEqual([
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS'
      ]);
      expect(options.allowedHeaders).toContain('Content-Type');
      expect(options.allowedHeaders).toContain('Authorization');
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should block all origins when CORS_ORIGINS is not set', () => {
      process.env.CORS_ORIGINS = '';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      // Simulate origin check
      (options.origin as Function)('https://example.com', callback);
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should allow specified origins in production', () => {
      process.env.CORS_ORIGINS = 'https://app.fluxapay.com,https://dashboard.fluxapay.com';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      // Test allowed origin
      (options.origin as Function)('https://app.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      
      callback.mockClear();
      (options.origin as Function)('https://dashboard.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should block non-specified origins in production', () => {
      process.env.CORS_ORIGINS = 'https://app.fluxapay.com';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      (options.origin as Function)('https://evil.com', callback);
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should block missing origins in production', () => {
      process.env.CORS_ORIGINS = 'https://app.fluxapay.com';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      (options.origin as Function)('', callback);
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should support wildcard subdomain patterns', () => {
      process.env.CORS_ORIGINS = '*.fluxapay.com';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      // Test subdomain match
      (options.origin as Function)('https://app.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      
      callback.mockClear();
      (options.origin as Function)('https://dashboard.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      
      callback.mockClear();
      (options.origin as Function)('https://evil.com', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should allow wildcard (*) origin when explicitly set', () => {
      process.env.CORS_ORIGINS = '*';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      (options.origin as Function)('https://any-origin.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should handle whitespace in CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = '  https://app.fluxapay.com  ,  https://dashboard.fluxapay.com  ';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      (options.origin as Function)('https://app.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      
      callback.mockClear();
      (options.origin as Function)('https://dashboard.fluxapay.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should include credentials and exposed headers in production', () => {
      process.env.CORS_ORIGINS = 'https://app.fluxapay.com';
      resetEnvConfig();
      
      const options = getCorsOptions();
      expect(options.credentials).toBe(true);
      expect(options.exposedHeaders).toContain('X-Request-ID');
    });
  });

  describe('Preflight Request Handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS = 'https://app.fluxapay.com';
    });

    it('should handle OPTIONS preflight requests correctly', () => {
      const mockReq: any = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.fluxapay.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type, Authorization'
        }
      };
      
      const mockRes: any = {
        statusCode: 204,
        headers: {} as Record<string, string>,
        setHeader: jest.fn((key: string, value: string) => {
          mockRes.headers[key.toLowerCase()] = value;
          return mockRes;
        }),
        end: jest.fn(),
        getHeader: jest.fn()
      };
      
      const mockNext = jest.fn();
      
      corsMiddleware(mockReq, mockRes, mockNext);
      
      // Verify preflight response headers
      expect(mockRes.headers['access-control-allow-origin']).toBe('https://app.fluxapay.com');
      expect(mockRes.headers['access-control-allow-methods']).toContain('POST');
      expect(mockRes.headers['access-control-allow-headers']).toContain('Authorization');
      expect(mockRes.headers['access-control-max-age']).toBe('86400');
    });

    it('should reject preflight requests from disallowed origins', () => {
      const mockReq: any = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.com',
          'access-control-request-method': 'POST'
        }
      };
      
      const mockRes: any = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader: jest.fn((key: string, value: string) => {
          mockRes.headers[key.toLowerCase()] = value;
          return mockRes;
        })
      };
      
      const mockNext = jest.fn();
      
      // Should not call next for blocked origins - CORS will handle the error
      corsMiddleware(mockReq, mockRes, mockNext);
      
      // The CORS middleware should block the request and not call next
      // It will set appropriate error headers instead
      expect(mockRes.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should handle empty origin strings', () => {
      process.env.CORS_ORIGINS = ',';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      (options.origin as Function)('https://example.com', callback);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(callback.mock.calls[0][1]).toBe(false);
    });

    it('should trim whitespace from individual origins', () => {
      process.env.CORS_ORIGINS = '  https://clean.com  ';
      resetEnvConfig();
      
      const options = getCorsOptions();
      const callback = jest.fn();
      
      (options.origin as Function)('https://clean.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });
});
