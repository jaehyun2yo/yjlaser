/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { proxyToNestJS } from '@/lib/api/webhard-proxy';

const mockRequireAuth = jest.fn();
const mockCheckWebhardRateLimit = jest.fn();

jest.mock('@/lib/auth/adminGuard', () => ({
  requireAuth: () => mockRequireAuth(),
}));

jest.mock('@/lib/auth/rateLimit', () => ({
  checkWebhardRateLimit: (request: NextRequest) => mockCheckWebhardRateLimit(request),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('proxyToNestJS response headers', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ authorized: true, response: null });
    mockCheckWebhardRateLimit.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('does not forward non-ByteString characters in Content-Disposition headers', async () => {
    const upstreamResponse = {
      status: 200,
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'content-type') return 'text/plain';
          if (name.toLowerCase() === 'content-disposition') {
            return 'attachment; filename="현장 가공용 테스트.DXF"';
          }
          return null;
        },
        getSetCookie: () => [],
      },
      blob: async () => new Blob(['deleted'], { type: 'text/plain' }),
    } as unknown as Response;
    global.fetch = jest.fn().mockResolvedValue(upstreamResponse) as typeof fetch;

    const request = new NextRequest('http://localhost:3000/api/webhard/folders/folder/delete', {
      method: 'DELETE',
      headers: { cookie: 'session=abc' },
    });

    const response = await proxyToNestJS(request, '/folders/folder/delete');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).not.toContain('현장');
    expect(response.headers.get('Content-Disposition')).toContain('%ED%98%84%EC%9E%A5');
  });

  it('creates a CSRF token for unsafe session-scoped webhard mutations when the cookie is missing', async () => {
    const upstreamResponse = {
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        getSetCookie: () => [],
      },
      json: async () => ({ ok: true }),
    } as unknown as Response;
    global.fetch = jest.fn().mockResolvedValue(upstreamResponse) as typeof fetch;

    const request = new NextRequest('http://localhost:3000/api/webhard/folders', {
      method: 'POST',
      headers: { cookie: 'admin-session=valid-session' },
    });

    await proxyToNestJS(request, '/folders', { method: 'POST', body: { name: '새 폴더' } });

    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Cookie).toMatch(/^admin-session=valid-session; csrf-token=[a-f0-9]{64}$/);
    expect(headers['X-CSRF-Token']).toMatch(/^[a-f0-9]{64}$/);
    expect(headers.Cookie).toContain(`csrf-token=${headers['X-CSRF-Token']}`);
  });

  it('disables caching for proxied webhard API responses', async () => {
    const upstreamResponse = {
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        getSetCookie: () => [],
      },
      json: async () => ({ files: [], total: 0 }),
    } as unknown as Response;
    global.fetch = jest.fn().mockResolvedValue(upstreamResponse) as typeof fetch;

    const request = new NextRequest('http://localhost:3000/api/webhard/files?folderId=folder-1', {
      method: 'GET',
      headers: { cookie: 'admin-session=valid-session' },
    });

    const response = await proxyToNestJS(request, '/files', {
      searchParams: new URLSearchParams([['folderId', 'folder-1']]),
    });

    const options = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(options.cache).toBe('no-store');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
