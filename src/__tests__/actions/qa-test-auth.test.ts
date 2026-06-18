/**
 * @jest-environment node
 */

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const originalEnv = { ...process.env };

async function loadQATestActions(env: NodeJS.ProcessEnv = {}) {
  jest.resetModules();
  process.env = { ...originalEnv, ...env };
  return import('@/app/actions/qa-test');
}

describe('QA test actions production guard', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('createQATestContacts fails closed in production before backend calls', async () => {
    const { createQATestContacts } = await loadQATestActions({
      VERCEL_ENV: 'production',
      INTEGRATION_API_KEY: 'test-key',
    });

    const result = await createQATestContacts();

    expect(result).toEqual({
      success: false,
      contacts: [],
      error: 'QA 테스트 작업은 production에서 비활성화되어 있습니다.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('deleteQATestContacts fails closed in production before search or delete calls', async () => {
    const { deleteQATestContacts } = await loadQATestActions({
      VERCEL_ENV: 'production',
      INTEGRATION_API_KEY: 'test-key',
    });

    const result = await deleteQATestContacts(['contact-1']);

    expect(result).toEqual({
      success: false,
      deleted: 0,
      error: 'QA 테스트 작업은 production에서 비활성화되어 있습니다.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
