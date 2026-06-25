import { validateEnv, resetEnvConfig, EnvValidationError } from '../env.config';

describe('Environment Configuration Validation', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // Reset environment before each test
        jest.resetModules();
        process.env = { ...originalEnv };
        resetEnvConfig();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('Required Variables', () => {
        it('should fail when DATABASE_URL is missing', () => {
            delete process.env.DATABASE_URL;
            process.env.JWT_SECRET = 'test-secret';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });

        it('should fail when JWT_SECRET is missing', () => {
            delete process.env.JWT_SECRET;
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });

        it('should fail when FUNDER_SECRET_KEY is missing', () => {
            delete process.env.FUNDER_SECRET_KEY;
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.JWT_SECRET = 'test-secret';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });

        it('should fail when USDC_ISSUER_PUBLIC_KEY is missing', () => {
            delete process.env.USDC_ISSUER_PUBLIC_KEY;
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.JWT_SECRET = 'test-secret';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });

        it('should fail when MASTER_VAULT_SECRET_KEY is missing', () => {
            delete process.env.MASTER_VAULT_SECRET_KEY;
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.JWT_SECRET = 'test-secret';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });
    });

    describe('Conditional Variables', () => {
        const setRequiredVars = () => {
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.JWT_SECRET = 'test-secret';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';
        };

        it('should fail when KMS_PROVIDER=aws but AWS_KMS_KEY_ID is missing', () => {
            setRequiredVars();
            process.env.KMS_PROVIDER = 'aws';
            delete process.env.AWS_KMS_KEY_ID;

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });

        it('should fail when EXCHANGE_PARTNER=yellowcard but YELLOWCARD_API_KEY is missing', () => {
            setRequiredVars();
            process.env.EXCHANGE_PARTNER = 'yellowcard';
            delete process.env.YELLOWCARD_API_KEY;

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });

        it('should fail when EXCHANGE_PARTNER=anchor but ANCHOR_API_KEY is missing', () => {
            setRequiredVars();
            process.env.EXCHANGE_PARTNER = 'anchor';
            delete process.env.ANCHOR_API_KEY;

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });

        it('should fail when KMS_PROVIDER=local but neither KMS_ENCRYPTED_MASTER_SEED nor HD_WALLET_MASTER_SEED is set', () => {
            setRequiredVars();
            process.env.KMS_PROVIDER = 'local';
            delete process.env.KMS_ENCRYPTED_MASTER_SEED;
            delete process.env.HD_WALLET_MASTER_SEED;

            expect(() => validateEnv()).toThrow(EnvValidationError);
        });
    });

    describe('Valid Configuration', () => {
        it('should pass with all required variables set', () => {
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.JWT_SECRET = 'test-secret';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';

            const config = validateEnv();
            expect(config).toBeDefined();
            expect(config.DATABASE_URL).toBe('postgresql://localhost/test');
            expect(config.JWT_SECRET).toBe('test-secret');
        });

        it('should use default values for optional variables', () => {
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.JWT_SECRET = 'test-secret';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';

            const config = validateEnv();
            expect(config.PORT).toBe(3000);
            expect(config.KMS_PROVIDER).toBe('local');
            expect(config.EXCHANGE_PARTNER).toBe('mock');
            expect(config.SETTLEMENT_FEE_PERCENT).toBe(2);
        });

        it('should parse numeric values correctly', () => {
            process.env.DATABASE_URL = 'postgresql://localhost/test';
            process.env.JWT_SECRET = 'test-secret';
            process.env.FUNDER_SECRET_KEY = 'test-key';
            process.env.USDC_ISSUER_PUBLIC_KEY = 'test-issuer';
            process.env.MASTER_VAULT_SECRET_KEY = 'test-vault';
            process.env.KMS_ENCRYPTED_MASTER_SEED = 'encrypted-seed';
            process.env.PORT = '5000';
            process.env.SETTLEMENT_FEE_PERCENT = '3.5';

            const config = validateEnv();
            expect(config.PORT).toBe(5000);
            expect(config.SETTLEMENT_FEE_PERCENT).toBe(3.5);
        });
    });
});
