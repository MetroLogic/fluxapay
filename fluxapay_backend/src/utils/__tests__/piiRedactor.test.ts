import { 
  redactAuthHeader, 
  redactApiKey, 
  redactToken, 
  hashIdentifier, 
  hashMerchantId, 
  redactEmail,
  sanitizeObject 
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
      expect(result.email).toBe('john@example.com');
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
  });
});
