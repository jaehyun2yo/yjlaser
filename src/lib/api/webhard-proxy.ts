/**
 * Webhard NestJS Proxy Utility
 *
 * Next.js API 라우트에서 NestJS 백엔드로 요청을 프록시합니다.
 * 세션 쿠키를 함께 전달하여 인증을 유지합니다.
 *
 * @security 모든 요청은 인증이 필요합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth/adminGuard';
import { checkWebhardRateLimit } from '@/lib/auth/rateLimit';
import { logger } from '@/lib/utils/logger';
import { sanitizeForwardedCookieHeader, toByteStringHeaderValue } from '@/lib/api/headerEncoding';

const proxyLogger = logger.createLogger('WEBHARD_PROXY');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const API_PREFIX = '/api/v1';
const CSRF_COOKIE_NAME = 'csrf-token';
const SESSION_COOKIE_NAMES = ['admin-session', 'company-session'] as const;

interface ProxyOptions {
  method?: string;
  body?: unknown;
  searchParams?: URLSearchParams;
  /** 인증 검사를 건너뛸지 여부 (기본값: false) */
  skipAuth?: boolean;
}

function createCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(';')) {
    const trimmedPart = part.trim();
    const separatorIndex = trimmedPart.indexOf('=');
    if (separatorIndex <= 0) continue;

    const name = trimmedPart.slice(0, separatorIndex);
    const value = trimmedPart.slice(separatorIndex + 1);
    cookies.set(name, value);
  }
  return cookies;
}

function buildSessionForwardingState(
  rawCookieHeader: string,
  method: string
): { cookieHeader: string; csrfToken?: string } {
  const cookies = parseCookieHeader(rawCookieHeader);
  const hasSession = SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
  let csrfToken = cookies.get(CSRF_COOKIE_NAME);
  let cookieSource = rawCookieHeader;

  if (isUnsafeMethod(method) && hasSession && !csrfToken) {
    csrfToken = createCsrfToken();
    cookieSource = rawCookieHeader.trim()
      ? `${rawCookieHeader}; ${CSRF_COOKIE_NAME}=${csrfToken}`
      : `${CSRF_COOKIE_NAME}=${csrfToken}`;
  }

  return {
    cookieHeader: sanitizeForwardedCookieHeader(cookieSource),
    csrfToken,
  };
}

/**
 * NestJS 백엔드로 요청을 프록시합니다.
 * @security 인증되지 않은 요청은 401 응답을 반환합니다.
 */
export async function proxyToNestJS(
  request: NextRequest,
  endpoint: string,
  options: ProxyOptions = {}
): Promise<NextResponse> {
  const { method = request.method, body, searchParams, skipAuth = false } = options;

  // 🔒 인증 + Rate Limiting 병렬 실행
  if (!skipAuth) {
    const [authResult, rateLimitResult] = await Promise.all([
      requireAuth(),
      checkWebhardRateLimit(request),
    ]);

    // 인증 검사 먼저 (보안 우선)
    if (!authResult.authorized) {
      proxyLogger.warn('인증되지 않은 웹하드 API 접근 시도', { endpoint, method });
      return authResult.response!;
    }

    // Rate Limiting 검사
    if (!rateLimitResult.allowed) {
      proxyLogger.warn('웹하드 API Rate Limit 초과', {
        endpoint,
        method,
        ip: rateLimitResult.ip,
        lockedUntil: rateLimitResult.lockedUntil,
      });
      return NextResponse.json(
        {
          error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
          retryAfter: rateLimitResult.lockedUntil
            ? Math.ceil((rateLimitResult.lockedUntil - Date.now()) / 1000)
            : 60,
        },
        { status: 429 }
      );
    }
  } else {
    // skipAuth일 때도 Rate Limiting은 적용
    const rateLimitResult = await checkWebhardRateLimit(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }
  }

  // Build URL
  let url = `${NESTJS_API_URL}${API_PREFIX}${endpoint}`;
  if (searchParams) {
    const params = searchParams.toString();
    if (params) {
      url += `?${params}`;
    }
  }

  // Get cookies from request
  const rawCookieHeader = request.headers.get('cookie') || '';
  const forwardedSession = buildSessionForwardingState(rawCookieHeader, method);

  // 요청 로그 (디버그 레벨)
  proxyLogger.debug('Proxying request', {
    endpoint,
    method,
    hasCookie: !!rawCookieHeader,
    cookieLength: rawCookieHeader.length,
  });

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Cookie: forwardedSession.cookieHeader,
    };
    if (forwardedSession.csrfToken) {
      headers['X-CSRF-Token'] = forwardedSession.csrfToken;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      cache: 'no-store',
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(body);
    }

    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;

    proxyLogger.info('NestJS proxy response', {
      endpoint,
      method,
      status: response.status,
      duration,
    });

    // Slow API warning (over 3 seconds)
    if (duration > 3000) {
      proxyLogger.warn('Slow NestJS API response', { endpoint, method, duration });
    }

    // Handle different content types
    const contentType = response.headers.get('content-type') || '';

    // Forward Set-Cookie headers from NestJS (CSRF token 등)
    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];

    if (contentType.includes('application/json')) {
      const data = await response.json();
      const nextResponse = NextResponse.json(data, { status: response.status });
      for (const cookie of setCookieHeaders) {
        nextResponse.headers.append('Set-Cookie', cookie);
      }
      return withNoStore(nextResponse);
    }

    // For non-JSON responses (like file downloads)
    const blob = await response.blob();
    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
    };
    const contentDisposition = toByteStringHeaderValue(response.headers.get('content-disposition'));
    if (contentDisposition) {
      responseHeaders['Content-Disposition'] = contentDisposition;
    }

    const nextResponse = new NextResponse(blob, {
      status: response.status,
      headers: responseHeaders,
    });
    for (const cookie of setCookieHeaders) {
      nextResponse.headers.append('Set-Cookie', cookie);
    }
    return withNoStore(nextResponse);
  } catch (error) {
    proxyLogger.error(
      'Failed to connect to webhard API',
      error instanceof Error ? error : undefined,
      {
        endpoint,
        method,
      }
    );
    return withNoStore(
      NextResponse.json({ error: 'Failed to connect to webhard API' }, { status: 502 })
    );
  }
}

/**
 * Request body를 파싱합니다.
 */
export async function parseBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * URL search params를 가져옵니다.
 */
export function getSearchParams(request: NextRequest): URLSearchParams {
  const { searchParams } = new URL(request.url);
  return searchParams;
}
