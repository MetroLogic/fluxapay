import { 
  redactAuthHeader, 
  redactApiKey, 
  redactToken, 
  hashIdentifier, 
  hashMerchantId, 
  redactEmail,
  sanitizeObject,
  redactRequestBody,
  redactRequestContext,
} from '../piiRedactor';

describe('PII Redactor', () => {
  describe('redactAuthHeader', () => {
    it('should redact Bearer tokens', () => {
      const result = redactAuthHeader('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0');
      expect(result).toMatch(/Bearer [a-zA-Z0-9]{4}\.\.\..{4}/);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact Basic auth', () => {
      const result = redactAuthHeader('Basic dXNlcm5hbWU6cGFzc3dvcmQ=');
      expect(result).toBe('Basic dXNl...cmQ=');
      expect(result).not.toContain('dXNlcm5hbWU6cGFzc3dvcmQ=');
    });

    it('should redact AccessKey', () => {
      const result = redactAuthHeader('AccessKey ABCD1234EFGH5678IJKL');
      expect(result).toBe('AccessKey ABCD...IJKL');
    });

    it('should handle undefined header', () => {
      const result = redactAuthHeader(undefined);
      expect(result).toBe('[REDACTED]');
    });

    it('should handle unknown auth format', () => {
      const result = redactAuthHeader('UnknownFormat123456');
      expect(result).toBe('[REDACTED]');
    });
  });

  describe('redactApiKey', () => {
    it('should show only last 4 characters of long API keys', () => {
      const result = redactApiKey('sk_live_abcdefgh1234');
      expect(result).toBe('***1234');
    });

    it('should redact short API keys completely', () => {
      const result = redactApiKey('short');
      expect(result).toBe('[REDACTED]');
    });

    it('should handle undefined API key', () => {
      const result = redactApiKey(undefined);
      expect(result).toBe('[REDACTED]');
    });
  });

  describe('redactToken', () => {
    it('should show first 4 and last 4 chars of long tokens', () => {
      const token = 'abcdefghijklmnopqrstuvwxyz';
      const result = redactToken(token);
      expect(result).toBe('abcd...wxyz');
    });

    it('should redact short tokens completely', () => {
      const result = redactToken('short');
      expect(result).toBe('[REDACTED]');
    });
  });

  describe('hashIdentifier', () => {
    it('should create consistent hashes for same input', () => {
      const hash1 = hashIdentifier('merchant-123');
      const hash2 = hashIdentifier('merchant-123');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should create different hashes with different salts', () => {
      const hash1 = hashIdentifier('merchant-123', 'salt1');
      const hash2 = hashIdentifier('merchant-123', 'salt2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const result = hashIdentifier('');
      expect(result).toBe('[UNKNOWN]');
    });
  });

  describe('hashMerchantId', () => {
    it('should hash merchant IDs consistently', () => {
      const hash1 = hashMerchantId('merch-abc-123');
      const hash2 = hashMerchantId('merch-abc-123');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should use default salt', () => {
      const hash = hashMerchantId('test-merchant');
      expect(hash).toMatch(/[a-f0-9]{16}/);
    });
  });

  describe('redactEmail', () => {
    it('should show first 2 chars and domain', () => {
      const result = redactEmail('john.doe@example.com');
      expect(result).toBe('jo***@example.com');
    });

    it('should handle short usernames', () => {
      const result = redactEmail('ab@example.com');
      expect(result).toBe('**@example.com');
    });

    it('should handle invalid emails', () => {
      const result = redactEmail('invalid-email');
      expect(result).toBe('[INVALID_EMAIL]');
    });

    it('should handle undefined emails', () => {
      const result = redactEmail(undefined);
      expect(result).toBe('[REDACTED]');
    });
  });

  describe('sanitizeObject', () => {
    it('should redact sensitive fields', () => {
      const obj = {
        name: 'John Doe',
        password: 'secret123',
        email: 'john@example.com',
        apiKey: 'sk_live_1234567890',
      };

      const result = sanitizeObject(obj);
      expect(result.name).toBe('John Doe');
      expect(result.password).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          name: 'Jane',
          token: 'abc123',
        },
        payment: {
          amount: 100,
          creditCard: '4111111111111111',
        },
      };

      const result = sanitizeObject(obj);
      expect(result.user.name).toBe('Jane');
      expect(result.user.token).toBe('[REDACTED]');
      expect(result.payment.amount).toBe(100);
      expect(result.payment.creditCard).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const obj = {
        users: [
          { name: 'Alice', password: 'pass1' },
          { name: 'Bob', password: 'pass2' },
        ],
      };

      const result = sanitizeObject(obj);
      expect(result.users[0].password).toBe('[REDACTED]');
      expect(result.users[1].password).toBe('[REDACTED]');
    });

    it('should respect custom sensitive fields', () => {
      const obj = {
        publicData: 'visible',
        secretCode: 'hidden',
      };

      const result = sanitizeObject(obj, ['secretCode']);
      expect(result.publicData).toBe('visible');
      expect(result.secretCode).toBe('[REDACTED]');
    });

    it('should handle null and non-object values', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject('string')).toBe('string');
      expect(sanitizeObject(123)).toBe(123);
    });

    it('should always redact secret_key regardless of log level', () => {
      const obj = { secret_key: 'sk_live_supersecret123', amount: 100 };
      const result = sanitizeObject(obj);
      expect(result.secret_key).toBe('[REDACTED]');
      expect(result.amount).toBe(100);
    });

    it('should always redact api_key', () => {
      const obj = { api_key: 'ak_live_abc123', name: 'merchant' };
      const result = sanitizeObject(obj);
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.name).toBe('merchant');
    });

    it('should always redact account_number', () => {
      const obj = { account_number: '1234567890', bank: 'First Bank' };
      const result = sanitizeObject(obj);
      expect(result.account_number).toBe('[REDACTED]');
    });
  });

  describe('redactRequestBody', () => {
    it('should redact api_key, secret_key, password, email, phone, account_number in request body', () => {
      const body = {
        api_key: 'ak_live_xyz',
        secret_key: 'sk_live_abc',
        password: 'hunter2',
        email: 'user@example.com',
        phone: '+2348012345678',
        account_number: '0123456789',
        amount: 200,
        currency: 'NGN',
      };
      const result = redactRequestBody(body);
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.secret_key).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED]');
      expect(result.phone).toBe('[REDACTED]');
      expect(result.account_number).toBe('[REDACTED]');
      // Non-sensitive fields untouched
      expect(result.amount).toBe(200);
      expect(result.currency).toBe('NGN');
    });

    it('should handle an undefined/null body gracefully', () => {
      expect(redactRequestBody(null)).toBe(null);
      expect(redactRequestBody(undefined)).toBe(undefined);
    });

    it('should redact nested sensitive fields in the body', () => {
      const body = { user: { email: 'a@b.com', name: 'Alice' } };
      const result = redactRequestBody(body);
      expect(result.user.email).toBe('[REDACTED]');
      expect(result.user.name).toBe('Alice');
    });
  });

  describe('redactRequestContext', () => {
    it('should redact Bearer token in authorization field', () => {
      const ctx = { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig' };
      const result = redactRequestContext(ctx);
      expect(result.authorization).toMatch(/^Bearer /);
      expect(result.authorization).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
    });

    it('should redact x-api-key field', () => {
      const ctx = { 'x-api-key': 'sk_live_abc1234567890' };
      const result = redactRequestContext(ctx);
      expect(result['x-api-key']).toMatch(/^\*\*\*/);
      expect(result['x-api-key']).not.toContain('sk_live_abc1234567890');
    });

    it('should not mutate the original context object', () => {
      const ctx = { authorization: 'Bearer secret_token', other: 'data' };
      redactRequestContext(ctx);
      expect(ctx.authorization).toBe('Bearer secret_token'); // original untouched
    });

    it('should pass through non-auth fields unchanged', () => {
      const ctx = { requestId: 'req-123', method: 'POST', statusCode: 200 };
      const result = redactRequestContext(ctx);
      expect(result.requestId).toBe('req-123');
      expect(result.method).toBe('POST');
      expect(result.statusCode).toBe(200);
    });

    it('should handle context without any sensitive fields gracefully', () => {
      const ctx = { method: 'GET', path: '/api/payments' };
      const result = redactRequestContext(ctx);
      expect(result).toEqual(ctx);
    });
  });
});
