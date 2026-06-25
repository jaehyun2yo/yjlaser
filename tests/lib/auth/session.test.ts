/**
 * @jest-environment node
 */

type CookieOptions = {
  domain?: string;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
};

type CookieRecord = {
  value: string;
};

type TestCookieStore = {
  delete: jest.Mock<void, [string]>;
  get: jest.Mock<CookieRecord | undefined, [string]>;
  set: jest.Mock<void, [string, string, CookieOptions]>;
};

const mockCookieValues = new Map<string, string>();
const mockCookieStore: TestCookieStore = {
  delete: jest.fn((name: string) => {
    mockCookieValues.delete(name);
  }),
  get: jest.fn((name: string) => {
    const value = mockCookieValues.get(name);
    return value ? { value } : undefined;
  }),
  set: jest.fn((name: string, value: string) => {
    mockCookieValues.set(name, value);
  }),
};
const mockCookies = jest.fn<Promise<TestCookieStore>, []>(() => Promise.resolve(mockCookieStore));
const mockGenerateSessionToken = jest.fn(() => 'raw-session-token');
const mockGetSessionSecret = jest.fn(() => 'test-session-secret-with-enough-length');

jest.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}));

jest.mock('@/lib/auth/security', () => ({
  generateSessionToken: () => mockGenerateSessionToken(),
}));

jest.mock('@/lib/utils/env', () => ({
  getSessionSecret: () => mockGetSessionSecret(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

import {
  createSession,
  destroySession,
  getSessionUser,
  verifyAndGetUser,
  verifySession,
} from '@/lib/auth/session';

describe('session utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-19T00:00:00.000Z'));
    jest.clearAllMocks();
    mockCookieValues.clear();
    mockCookies.mockResolvedValue(mockCookieStore);
    mockGenerateSessionToken.mockReturnValue('raw-session-token');
    mockGetSessionSecret.mockReturnValue('test-session-secret-with-enough-length');
    delete process.env.COOKIE_DOMAIN;
    delete process.env.SESSION_SECRET_PREVIOUS;
    delete process.env.SESSION_SECRET_PREVIOUS_EXPIRES_AT;
    delete process.env.SESSION_LEGACY_COOKIE_COMPAT_UNTIL;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('업체 세션 쿠키를 서명해 저장하고 같은 쿠키에서 업체 사용자를 복원한다', async () => {
    const token = await createSession('company', 42, { maxAge: 123 });

    expect(token).toBe('raw-session-token');
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'company-session',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        maxAge: 123,
        path: '/',
        sameSite: 'lax',
        secure: false,
      })
    );
    await expect(getSessionUser()).resolves.toEqual({ userType: 'company', userId: 42 });
  });

  it('관리자 세션을 검증하고 로그아웃 시 관리자/업체 쿠키를 모두 삭제한다', async () => {
    await createSession('admin');

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'admin-session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 60 * 60 * 4, path: '/' })
    );
    await expect(verifySession()).resolves.toBe(true);

    await destroySession();

    expect(mockCookieStore.delete).toHaveBeenCalledWith('admin-session');
    expect(mockCookieStore.delete).toHaveBeenCalledWith('company-session');
    await expect(verifySession()).resolves.toBe(false);
  });

  it('서명이 변조된 쿠키는 유효한 세션으로 취급하지 않는다', async () => {
    await createSession('company', 42);
    const signedCookie = mockCookieValues.get('company-session');
    if (!signedCookie) throw new Error('company-session cookie was not set');
    mockCookieValues.set('company-session', `${signedCookie}tampered`);

    await expect(verifyAndGetUser()).resolves.toEqual({ isValid: false, user: null });
  });

  it('만료 시간이 지난 쿠키는 사용자 정보를 반환하지 않는다', async () => {
    await createSession('company', 42, { maxAge: 1 });

    jest.setSystemTime(new Date('2026-06-19T00:00:02.000Z'));

    await expect(getSessionUser()).resolves.toBeNull();
  });
});
