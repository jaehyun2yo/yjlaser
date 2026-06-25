import { isOperationalE2eMockStorageEnabled } from './operational-e2e-env.util';

describe('operational E2E environment guards', () => {
  it('allows mock storage in local test runtime', () => {
    expect(
      isOperationalE2eMockStorageEnabled({
        NODE_ENV: 'test',
        OPERATIONAL_E2E_MOCK_STORAGE: 'true',
      })
    ).toBe(true);
  });

  it.each([
    { NODE_ENV: 'production', OPERATIONAL_E2E_MOCK_STORAGE: 'true' },
    { NODE_ENV: 'test', VERCEL_ENV: 'production', OPERATIONAL_E2E_MOCK_STORAGE: 'true' },
    { NODE_ENV: 'test', RAILWAY_ENVIRONMENT: 'production', OPERATIONAL_E2E_MOCK_STORAGE: 'true' },
  ])('rejects mock storage in production-like runtime %#', (env) => {
    expect(() => isOperationalE2eMockStorageEnabled(env)).toThrow(
      'OPERATIONAL_E2E_MOCK_STORAGE is not allowed in production runtime'
    );
  });
});
