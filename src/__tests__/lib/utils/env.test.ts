import { getSessionSecret, validateEnv } from '@/lib/utils/env';

// 환경 변수 백업
const originalEnv = process.env;

describe('Environment Validation', () => {
  beforeEach(() => {
    // 각 테스트 전에 환경 변수 초기화
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // 모든 테스트 후 원래 환경 변수 복원
    process.env = originalEnv;
  });

  describe('validateEnv', () => {
    it('should validate environment variables when required secrets are set', () => {
      process.env.NODE_ENV = 'test';
      process.env.SESSION_SECRET = 'a'.repeat(32);

      expect(() => validateEnv()).not.toThrow();
    });

    it('should fail closed in test when SESSION_SECRET is missing', () => {
      delete process.env.SESSION_SECRET;
      process.env.NODE_ENV = 'test';

      expect(() => validateEnv()).toThrow();
    });
  });

  describe('getSessionSecret', () => {
    it('should return session secret when set', () => {
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.NODE_ENV = 'test';

      const secret = getSessionSecret();
      expect(secret).toBe('a'.repeat(32));
    });

    it('should throw error in production when secret is not set', () => {
      delete process.env.SESSION_SECRET;
      process.env.NODE_ENV = 'production';

      expect(() => getSessionSecret()).toThrow();
    });

    it('should throw error in test when secret is not set', () => {
      delete process.env.SESSION_SECRET;
      process.env.NODE_ENV = 'test';

      expect(() => getSessionSecret()).toThrow();
    });

    it('should throw error in development when secret is not set', () => {
      delete process.env.SESSION_SECRET;
      process.env.NODE_ENV = 'development';

      expect(() => getSessionSecret()).toThrow();
    });
  });
});
