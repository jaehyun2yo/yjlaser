/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/lib/auth/session', () => ({
  verifyAndGetUser: jest.fn(),
}));

jest.mock('@/lib/auth/erp-session', () => ({
  getErpWorkerSession: jest.fn(),
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

import { cookies } from 'next/headers';
import { verifyAndGetUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { POST as createErpSession } from '@/app/api/erp/session/route';
import { POST as createSocketToken } from '@/app/api/socket-auth/route';
import { GET as getWorkerFiles } from '@/app/api/worker/files/route';
import { GET as downloadWorkerFile } from '@/app/api/worker/files/[id]/download/route';
import {
  GET as getWorkerDrawingRevisions,
  POST as createWorkerDrawingRevision,
} from '@/app/api/worker/drawing-revisions/route';
import { POST as createWorkerUploadUrls } from '@/app/api/worker/drawing-revisions/upload-urls/route';

const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockedVerifyAndGetUser = verifyAndGetUser as jest.MockedFunction<typeof verifyAndGetUser>;
const mockedGetErpWorkerSession = getErpWorkerSession as jest.MockedFunction<
  typeof getErpWorkerSession
>;

function makeRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), init);
}

function mockCookieStore(cookieValue = 'forged.erp-session') {
  mockedCookies.mockResolvedValue({
    get: jest.fn((name: string) =>
      name === 'erp-session' ? { name, value: cookieValue } : undefined
    ),
    set: jest.fn(),
    delete: jest.fn(),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('worker auth boundary', () => {
  const originalFetch = global.fetch;
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSION_SECRET = 'test-session-secret-for-worker-boundary'.repeat(2);
    mockCookieStore();
    mockedGetErpWorkerSession.mockResolvedValue(null);
    mockedVerifyAndGetUser.mockResolvedValue({ isValid: false, user: null });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it('/api/erp/session rejects workerId-only POST without PIN proof', async () => {
    const response = await createErpSession(
      makeRequest('/api/erp/session', {
        method: 'POST',
        body: JSON.stringify({ workerId: 'worker-1', workerName: '홍길동' }),
      })
    );

    expect(response.status).toBe(401);
    expect(mockedCookies).not.toHaveBeenCalled();
  });

  it('/api/erp/session creates csrf-token with verified worker session', async () => {
    const setCookie = jest.fn();
    mockedCookies.mockResolvedValue({
      get: jest.fn(),
      set: setCookie,
      delete: jest.fn(),
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          worker: { id: 'worker-1', name: '김작업', role: 'worker', worker_type: 'office' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const response = await createErpSession(
      makeRequest('/api/erp/session', {
        method: 'POST',
        body: JSON.stringify({ name: '김작업', pin: '1234' }),
      })
    );

    expect(response.status).toBe(200);
    expect(setCookie).toHaveBeenCalledWith(
      'erp-session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    );
    expect(setCookie).toHaveBeenCalledWith(
      'csrf-token',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({ httpOnly: false })
    );
  });

  it('/api/worker/files rejects forged erp-session before backend fetch', async () => {
    const response = await getWorkerFiles(makeRequest('/api/worker/files?folderId=folder-1'));

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('/api/worker/files forwards verified worker session instead of backend API key', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ files: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await getWorkerFiles(
      makeRequest('/api/worker/files?folderId=folder-1', {
        headers: {
          cookie:
            'admin-session=admin-token; company-session=company-token; erp-session=signed-worker',
        },
      })
    );

    expect(response.status).toBe(200);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual(
      expect.objectContaining({
        Cookie: 'erp-session=signed-worker',
      })
    );
    expect((init.headers as Record<string, string>).Cookie).not.toContain('admin-session');
    expect((init.headers as Record<string, string>).Cookie).not.toContain('company-session');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBeUndefined();
  });

  it('/api/worker/files preserves backend ACL 403 response', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Worker folder access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await getWorkerFiles(
      makeRequest('/api/worker/files?folderId=unauthorized-folder', {
        headers: { cookie: 'erp-session=signed-worker' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ success: false, error: 'Worker folder access denied' });
  });

  it('/api/worker/files/[id]/download rejects forged erp-session before backend fetch', async () => {
    const response = await downloadWorkerFile(makeRequest('/api/worker/files/file-1/download'), {
      params: Promise.resolve({ id: 'file-1' }),
    });

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('/api/worker/files/[id]/download forwards verified worker session instead of backend API key', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://r2.example.test/file', fileName: 'file.dxf' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await downloadWorkerFile(
      makeRequest('/api/worker/files/file-1/download', {
        headers: {
          cookie:
            'admin-session=admin-token; company-session=company-token; erp-session=signed-worker',
        },
      }),
      {
        params: Promise.resolve({ id: 'file-1' }),
      }
    );

    expect(response.status).toBe(200);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual(
      expect.objectContaining({
        Cookie: 'erp-session=signed-worker',
      })
    );
    expect((init.headers as Record<string, string>).Cookie).not.toContain('admin-session');
    expect((init.headers as Record<string, string>).Cookie).not.toContain('company-session');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBeUndefined();
  });

  it('/api/worker/files/[id]/download preserves backend ACL 403 response', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Worker file access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await downloadWorkerFile(
      makeRequest('/api/worker/files/unauthorized-file/download', {
        headers: { cookie: 'erp-session=signed-worker' },
      }),
      {
        params: Promise.resolve({ id: 'unauthorized-file' }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ success: false, error: 'Worker file access denied' });
  });

  it('/api/worker/drawing-revisions GET rejects forged erp-session before backend fetch', async () => {
    const response = await getWorkerDrawingRevisions(
      makeRequest('/api/worker/drawing-revisions?contactId=contact-1')
    );

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('/api/worker/drawing-revisions GET preserves backend ACL 403 response', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Worker contact access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await getWorkerDrawingRevisions(
      makeRequest('/api/worker/drawing-revisions?contactId=unauthorized-contact', {
        headers: { cookie: 'erp-session=signed-worker' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Worker contact access denied' });
  });

  it('/api/worker/drawing-revisions POST rejects forged erp-session before backend fetch', async () => {
    const response = await createWorkerDrawingRevision(
      makeRequest('/api/worker/drawing-revisions', {
        method: 'POST',
        body: JSON.stringify({ contactId: 'contact-1', reason: 'update', files: [] }),
      })
    );

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('/api/worker/drawing-revisions POST forwards verified worker session instead of backend API key', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ id: 'revision-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await createWorkerDrawingRevision(
      makeRequest('/api/worker/drawing-revisions', {
        method: 'POST',
        headers: {
          cookie:
            'admin-session=admin-token; company-session=company-token; erp-session=signed-worker; csrf-token=csrf-1',
        },
        body: JSON.stringify({ contactId: 'contact-1', reason: 'update', files: [] }),
      })
    );

    expect(response.status).toBe(201);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/contacts/contact-1/drawing-revisions'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'erp-session=signed-worker; csrf-token=csrf-1',
          'X-CSRF-Token': 'csrf-1',
        }),
      })
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Cookie).not.toContain('admin-session');
    expect((init.headers as Record<string, string>).Cookie).not.toContain('company-session');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        actorType: 'worker',
        actorName: '검증작업자',
      })
    );
  });

  it('/api/worker/drawing-revisions/upload-urls rejects forged erp-session before backend fetch', async () => {
    const response = await createWorkerUploadUrls(
      makeRequest('/api/worker/drawing-revisions/upload-urls', {
        method: 'POST',
        body: JSON.stringify({
          contactId: 'contact-1',
          files: [{ name: 'drawing.dxf', mimeType: 'application/dxf' }],
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('/api/worker/drawing-revisions/upload-urls forwards only verified worker cookies', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify([{ uploadUrl: 'https://r2.example.test/upload', key: 'k1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await createWorkerUploadUrls(
      makeRequest('/api/worker/drawing-revisions/upload-urls', {
        method: 'POST',
        headers: {
          cookie:
            'admin-session=admin-token; company-session=company-token; erp-session=signed-worker; csrf-token=csrf-1',
        },
        body: JSON.stringify({
          contactId: 'contact-1',
          files: [{ name: 'drawing.dxf', mimeType: 'application/dxf' }],
        }),
      })
    );

    expect(response.status).toBe(200);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual(
      expect.objectContaining({
        Cookie: 'erp-session=signed-worker; csrf-token=csrf-1',
        'X-CSRF-Token': 'csrf-1',
      })
    );
    expect((init.headers as Record<string, string>).Cookie).not.toContain('admin-session');
    expect((init.headers as Record<string, string>).Cookie).not.toContain('company-session');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBeUndefined();
  });

  it('/api/worker/drawing-revisions/upload-urls preserves backend ACL 403 response', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Worker contact access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await createWorkerUploadUrls(
      makeRequest('/api/worker/drawing-revisions/upload-urls', {
        method: 'POST',
        headers: { cookie: 'erp-session=signed-worker; csrf-token=csrf-1' },
        body: JSON.stringify({
          contactId: 'unauthorized-contact',
          files: [{ name: 'drawing.dxf', mimeType: 'application/dxf' }],
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Worker contact access denied' });
  });

  it('/api/worker/drawing-revisions/upload-urls synthesizes csrf for worker POST when missing', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '검증작업자',
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify([{ uploadUrl: 'https://r2.example.test/upload', key: 'k1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await createWorkerUploadUrls(
      makeRequest('/api/worker/drawing-revisions/upload-urls', {
        method: 'POST',
        headers: {
          cookie: 'admin-session=admin-token; erp-session=signed-worker',
        },
        body: JSON.stringify({
          contactId: 'contact-1',
          files: [{ name: 'drawing.dxf', mimeType: 'application/dxf' }],
        }),
      })
    );

    expect(response.status).toBe(200);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Cookie).toMatch(/^erp-session=signed-worker; csrf-token=[a-f0-9]{64}$/);
    expect(headers['X-CSRF-Token']).toMatch(/^[a-f0-9]{64}$/);
    expect(headers.Cookie).toContain(`csrf-token=${headers['X-CSRF-Token']}`);
    expect(headers.Cookie).not.toContain('admin-session');
  });

  it('/api/socket-auth rejects forged erp-session instead of issuing a worker token', async () => {
    const response = await createSocketToken();

    expect(response.status).toBe(401);
  });
});
