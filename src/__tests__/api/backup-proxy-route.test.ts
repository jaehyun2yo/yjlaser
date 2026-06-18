/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
  getSessionUser: jest.fn(),
}));

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

import { getSessionUser, verifySession } from '@/lib/auth/session';
import { GET as getBackupProxy } from '@/app/api/admin/backup/[...path]/route';

const mockedVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;

function makeRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), init);
}

describe('admin backup proxy route', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedVerifySession.mockResolvedValue(true);
    mockedGetSessionUser.mockResolvedValue({ userType: 'admin', userId: 'admin' });
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('forwards upstream Set-Cookie headers so admin CSRF cookie bootstrap works', async () => {
    const upstreamResponse = {
      status: 200,
      headers: {
        getSetCookie: () => [
          'csrf-token=new-token; Path=/; HttpOnly; SameSite=Lax',
          'backup-session=next; Path=/; HttpOnly; SameSite=Lax',
        ],
      },
      json: async () => ({ ok: true }),
    } as unknown as Response;
    global.fetch = jest.fn().mockResolvedValue(upstreamResponse) as typeof fetch;

    const response = await getBackupProxy(
      makeRequest('/api/admin/backup/settings', {
        headers: { cookie: 'admin-session=valid; csrf-token=old-token' },
      }),
      { params: Promise.resolve({ path: ['settings'] }) }
    );

    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(setCookie).toContain('csrf-token=new-token');
    expect(setCookie).toContain('backup-session=next');
  });
});
