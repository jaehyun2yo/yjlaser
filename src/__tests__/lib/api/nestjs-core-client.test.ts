jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { cookies } from 'next/headers';
import { nestjsFetch, routeTemplateForLog } from '@/lib/api/nestjs/core.client';

const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;

describe('nestjsFetch', () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRecoveryApiKey = process.env.ACCOUNT_RECOVERY_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalRecoveryApiKey === undefined) {
      delete process.env.ACCOUNT_RECOVERY_API_KEY;
    } else {
      process.env.ACCOUNT_RECOVERY_API_KEY = originalRecoveryApiKey;
    }
  });

  it('percent-encodes non-ASCII cookie values before forwarding the Cookie header', async () => {
    mockedCookies.mockResolvedValue({
      getAll: () => [
        { name: 'admin-session', value: 'signed-token' },
        { name: 'flash-message', value: '관리자에게 삭제 요청해주세요' },
      ],
      get: () => undefined,
    } as Awaited<ReturnType<typeof cookies>>);

    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ ok: true, cookie: headers.get('Cookie') }),
      } as Response;
    });
    global.fetch = fetchMock;

    const response = await nestjsFetch<{ ok: boolean; cookie: string }>('/folders/batch-delete', {
      method: 'DELETE',
      body: { folderIds: ['folder-1'] },
    });

    expect(response.ok).toBe(true);
    expect(response.data.cookie).toContain(
      'flash-message=%EA%B4%80%EB%A6%AC%EC%9E%90%EC%97%90%EA%B2%8C%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94'
    );
  });

  it('routeTemplateForLog strips query strings and dynamic route segments', () => {
    expect(
      routeTemplateForLog('/contacts/018f00aa-1111-2222-3333-abcdefabcdef/process-stage?token=raw')
    ).toBe('/contacts/:value/process-stage');
    expect(routeTemplateForLog('/files/customer-slug/download?presigned=raw')).toBe(
      '/files/:value/download'
    );
    expect(routeTemplateForLog('/auth/find-id/request')).toBe('/auth/find-id/request');
  });

  it('forwardedCookieNames 옵션은 지정한 쿠키만 NestJS로 전달한다', async () => {
    mockedCookies.mockResolvedValue({
      getAll: () => [
        { name: 'admin-session', value: 'admin-token' },
        { name: 'company-session', value: 'company-token' },
        { name: 'erp-session', value: 'worker-token' },
        { name: 'csrf-token', value: 'csrf-1' },
      ],
      get: (name: string) => (name === 'csrf-token' ? { name, value: 'csrf-1' } : undefined),
    } as Awaited<ReturnType<typeof cookies>>);

    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          cookie: headers.get('Cookie'),
          csrf: headers.get('X-CSRF-Token'),
        }),
      } as Response;
    });
    global.fetch = fetchMock;

    const response = await nestjsFetch<{ cookie: string | null; csrf: string | null }>(
      '/contacts/contact-1/process-stage',
      {
        method: 'PATCH',
        body: { processStage: 'laser' },
        forwardedCookieNames: ['erp-session', 'csrf-token'],
      }
    );

    expect(response.data).toEqual({
      cookie: 'erp-session=worker-token; csrf-token=csrf-1',
      csrf: 'csrf-1',
    });
  });

  it('worker session mutation은 csrf-token이 없으면 upstream 요청용 token을 생성한다', async () => {
    mockedCookies.mockResolvedValue({
      getAll: () => [
        { name: 'admin-session', value: 'admin-token' },
        { name: 'erp-session', value: 'worker-token' },
      ],
      get: () => undefined,
    } as Awaited<ReturnType<typeof cookies>>);

    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          cookie: headers.get('Cookie'),
          csrf: headers.get('X-CSRF-Token'),
        }),
      } as Response;
    });
    global.fetch = fetchMock;

    const response = await nestjsFetch<{ cookie: string | null; csrf: string | null }>(
      '/contacts/contact-1/notes',
      {
        method: 'POST',
        body: { type: 'memo', content: '확인', createdBy: '김작업' },
        forwardedCookieNames: ['erp-session', 'csrf-token'],
      }
    );

    expect(response.data.cookie).toMatch(/^erp-session=worker-token; csrf-token=[a-f0-9]{64}$/);
    expect(response.data.csrf).toMatch(/^[a-f0-9]{64}$/);
    expect(response.data.cookie).toContain(`csrf-token=${response.data.csrf}`);
    expect(response.data.cookie).not.toContain('admin-session');
  });

  it('useRecoveryApiKey 옵션은 계정 복구 전용 header를 첨부한다', async () => {
    process.env.ACCOUNT_RECOVERY_API_KEY = 'recovery-secret';
    mockedCookies.mockRejectedValue(new Error('cookies unavailable'));

    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          recoveryKey: headers.get('X-Account-Recovery-Key'),
          apiKey: headers.get('X-API-Key'),
        }),
      } as Response;
    });
    global.fetch = fetchMock;

    const response = await nestjsFetch<{ recoveryKey: string | null; apiKey: string | null }>(
      '/auth/find-id/request',
      {
        method: 'POST',
        body: { companyName: '대성목형' },
        useRecoveryApiKey: true,
      }
    );

    expect(response.data).toEqual({
      recoveryKey: 'recovery-secret',
      apiKey: null,
    });
  });

  it('development에서 recovery key가 없으면 dev-only 기본 recovery header를 첨부한다', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ACCOUNT_RECOVERY_API_KEY;
    mockedCookies.mockRejectedValue(new Error('cookies unavailable'));

    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          recoveryKey: headers.get('X-Account-Recovery-Key'),
        }),
      } as Response;
    });
    global.fetch = fetchMock;

    const response = await nestjsFetch<{ recoveryKey: string | null }>('/auth/find-id/request', {
      method: 'POST',
      body: { companyName: '대성목형' },
      useRecoveryApiKey: true,
    });

    expect(response.data).toEqual({
      recoveryKey: 'yjlaser-dev-account-recovery-key',
    });
  });

  it('production에서 recovery key가 없으면 NestJS로 무키 요청을 보내지 않는다', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ACCOUNT_RECOVERY_API_KEY;
    mockedCookies.mockRejectedValue(new Error('cookies unavailable'));
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const response = await nestjsFetch<{ success: boolean; message: string }>(
      '/auth/find-id/request',
      {
        method: 'POST',
        body: { companyName: '대성목형' },
        useRecoveryApiKey: true,
      }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response).toEqual({
      ok: false,
      status: 503,
      data: {
        success: false,
        message: '계정 복구 설정이 누락되었습니다. 관리자에게 문의해주세요.',
      },
    });
  });

  it('staging에서 recovery key가 없으면 dev-only recovery header를 첨부하지 않는다', async () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.ACCOUNT_RECOVERY_API_KEY;
    mockedCookies.mockRejectedValue(new Error('cookies unavailable'));
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const response = await nestjsFetch<{ success: boolean; message: string }>(
      '/auth/find-id/request',
      {
        method: 'POST',
        body: { companyName: '대성목형' },
        useRecoveryApiKey: true,
      }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
  });
});
