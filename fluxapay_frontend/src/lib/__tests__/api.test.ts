import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API_BASE_URL configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should fail in production when NEXT_PUBLIC_API_URL is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(() => {
      require('../api');
    }).toThrow(/NEXT_PUBLIC_API_URL/i);
  });

  it('should use localhost fallback in development when NEXT_PUBLIC_API_URL is unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_API_URL;

    const consoleSpy = vi.spyOn(console, 'warn');
    const { api } = require('../api');

    expect(api).toBeDefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_PUBLIC_API_URL')
    );
  });

  it('should use provided NEXT_PUBLIC_API_URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

    const { api } = require('../api');
    expect(api).toBeDefined();
  });

  it('should use provided NEXT_PUBLIC_API_URL in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

    const { api } = require('../api');
    expect(api).toBeDefined();
  });
});
