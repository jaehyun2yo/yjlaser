import { createHash } from 'crypto';
import { hashIdentifier } from './log-event';

const ORIGINAL_ENV = {
  LOG_IDENTIFIER_HASH_SECRET: process.env.LOG_IDENTIFIER_HASH_SECRET,
  LOG_HASH_SECRET: process.env.LOG_HASH_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

describe('hashIdentifier', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('uses HMAC-SHA256 instead of unsalted SHA-256 for identifier logs', () => {
    process.env.LOG_IDENTIFIER_HASH_SECRET = 'test-log-identifier-hash-secret-32-bytes';
    delete process.env.LOG_HASH_SECRET;
    delete process.env.SESSION_SECRET;

    const value = 'company-site';
    const unsaltedSha256 = createHash('sha256').update(value).digest('hex').slice(0, 16);

    expect(hashIdentifier(value)).not.toBe(unsaltedSha256);
    expect(hashIdentifier(value)).toBe(hashIdentifier(value));
    expect(hashIdentifier(value)).not.toBe(hashIdentifier('other-client'));
  });

  it('fails closed when an explicit log hash secret is too short', () => {
    process.env.LOG_IDENTIFIER_HASH_SECRET = 'short';
    delete process.env.LOG_HASH_SECRET;
    delete process.env.SESSION_SECRET;

    expect(() => hashIdentifier('company-site')).toThrow('LOG_IDENTIFIER_HASH_SECRET_TOO_SHORT');
  });
});

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
