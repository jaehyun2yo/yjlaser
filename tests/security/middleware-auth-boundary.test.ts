/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

function makeRequest(pathname: string, cookie?: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    headers: {
      ...headers,
      ...(cookie ? { cookie } : {}),
    },
  });
}

function expectRedirectsToLogin(
  response: Response,
  loginPath: string,
  expectedNextPath?: string,
) {
  expect(response.headers.get('x-middleware-next')).not.toBe('1');
  const location = response.headers.get('location');
  expect(location).not.toBeNull();

  const redirectUrl = new URL(location!);
  expect(redirectUrl.pathname).toBe(loginPath);
  if (expectedNextPath) {
    expect(redirectUrl.searchParams.get('next')).toBe(expectedNextPath);
  }
}

describe('middleware auth boundary', () => {
  it('redirects forged admin-session cookies instead of trusting token.signature shape', async () => {
    const response = await middleware(makeRequest('/admin/companies', 'admin-session=a.b'));

    expectRedirectsToLogin(response, '/login', '/admin/companies');
  });

  it('redirects forged company-session cookies instead of trusting token.signature shape', async () => {
    const response = await middleware(makeRequest('/company/dashboard', 'company-session=a.b'));

    expectRedirectsToLogin(response, '/login');
  });

  it('redirects forged worker erp-session cookies instead of trusting token.signature shape', async () => {
    const response = await middleware(makeRequest('/worker/dashboard', 'erp-session=a.b'));

    expectRedirectsToLogin(response, '/worker/login');
  });

  it('does not bypass admin workshop auth from an untrusted x-forwarded-for value', async () => {
    const response = await middleware(
      makeRequest('/admin/integration/workshop', undefined, {
        'x-forwarded-for': '192.168.1.25',
      })
    );

    expectRedirectsToLogin(
      response,
      '/login',
      '/admin/integration/workshop',
    );
  });
});
