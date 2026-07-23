import { NextRequest, NextResponse } from 'next/server';

import { verifyBrowserSessionCookie } from '@/lib/auth/edge-session';

import { middleware } from '../../../middleware';

jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn(() => ({ type: 'next' })),
    redirect: jest.fn((url: URL) => ({
      type: 'redirect',
      url: url.toString(),
    })),
  },
}));

jest.mock('@/lib/auth/edge-session', () => ({
  verifyBrowserSessionCookie: jest.fn(),
  verifyWorkerSessionCookie: jest.fn(),
}));

const mockedVerifyBrowserSessionCookie = jest.mocked(
  verifyBrowserSessionCookie,
);

function createRequest(pathname: string): NextRequest {
  return {
    nextUrl: { pathname },
    url: `https://www.yjlaser.net${pathname}`,
    cookies: {
      get: jest.fn().mockReturnValue(undefined),
    },
  } as unknown as NextRequest;
}

describe('관리자 인증 미들웨어', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('미인증 관리자를 공통 로그인 화면으로 보내고 원래 경로를 보존한다', async () => {
    mockedVerifyBrowserSessionCookie.mockResolvedValue(null);

    await middleware(createRequest('/admin/integration/devices'));

    const redirectMock = jest.mocked(NextResponse.redirect);
    expect(redirectMock).toHaveBeenCalledTimes(1);

    const redirectUrl = redirectMock.mock.calls[0]?.[0];
    expect(redirectUrl).toBeInstanceOf(URL);
    expect(redirectUrl.pathname).toBe('/login');
    expect(redirectUrl.searchParams.get('next')).toBe(
      '/admin/integration/devices',
    );
  });
});
