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

function expectRedirectsToLogin(response: Response, loginPath: string) {
  expect(response.headers.get('x-middleware-next')).not.toBe('1');
  expect(response.headers.get('location')).toContain(loginPath);
}

describe('middleware auth boundary', () => {
  it('redirects forged admin-session cookies instead of trusting token.signature shape', async () => {
    const response = await middleware(makeRequest('/admin/companies', 'admin-session=a.b'));

    expectRedirectsToLogin(response, '/admin/login');
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

    expectRedirectsToLogin(response, '/admin/login');
  });
});
