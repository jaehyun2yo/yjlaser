import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { buildForwardedCookieHeader, toByteStringHeaderValue } from '@/lib/api/headerEncoding';

const WORKER_FORWARDED_COOKIE_NAMES = ['erp-session', 'csrf-token'] as const;
const CSRF_COOKIE_NAME = 'csrf-token';

type ForwardedWorkerCookie = {
  name: string;
  value: string;
};

function createCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function buildWorkerSessionHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const forwardedCookies = WORKER_FORWARDED_COOKIE_NAMES.map((name) =>
    request.cookies.get(name)
  ).filter((cookie): cookie is ForwardedWorkerCookie => Boolean(cookie?.name && cookie.value));
  let csrfToken = toByteStringHeaderValue(request.cookies.get(CSRF_COOKIE_NAME)?.value ?? null);
  const hasWorkerSession = forwardedCookies.some((cookie) => cookie.name === 'erp-session');

  if (isUnsafeMethod(request.method) && hasWorkerSession && !csrfToken) {
    csrfToken = createCsrfToken();
    forwardedCookies.push({ name: CSRF_COOKIE_NAME, value: csrfToken });
  }

  if (forwardedCookies.length > 0) {
    headers.Cookie = buildForwardedCookieHeader(forwardedCookies);
  }

  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  return headers;
}
