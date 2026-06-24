/**
 * NestJS Server-Side API Client Core
 *
 * Server Actions / SSR에서 NestJS 백엔드를 직접 호출하기 위한 공통 fetch 유틸리티.
 * 세션 쿠키를 전달하여 기존 인증 체계를 유지합니다.
 *
 * @security 모든 요청에 세션 쿠키 또는 API Key를 첨부합니다.
 */

import { cookies } from 'next/headers';
import crypto from 'crypto';
import { logger } from '@/lib/utils/logger';
import { buildForwardedCookieHeader } from '@/lib/api/headerEncoding';

export const nestjsLogger = logger.createLogger('NESTJS_CLIENT');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const API_PREFIX = '/api/v1';
const API_KEY = process.env.MIGRATION_API_KEY || '';
const RECOVERY_API_KEY_MISSING_MESSAGE =
  '계정 복구 설정이 누락되었습니다. 관리자에게 문의해주세요.';
const CSRF_COOKIE_NAME = 'csrf-token';
const SESSION_COOKIE_NAMES = ['admin-session', 'company-session', 'worker-session', 'erp-session'];
const SAFE_ROUTE_SEGMENTS = new Set([
  'activity-logs',
  'admin',
  'auth',
  'batch',
  'batch-delete',
  'check-duplicate',
  'complete',
  'contacts',
  'count',
  'download',
  'find-id',
  'find-password',
  'folders',
  'files',
  'integration',
  'list',
  'multipart',
  'notes',
  'presign',
  'process-stage',
  'request',
  'sessions',
  'share-links',
  'status',
  'storage',
  'sync-logs',
  'upload',
  'webhard-consistency',
]);

export interface NestJSRequestOptions {
  method?: string;
  body?: unknown;
  /** Use API Key instead of session cookie */
  useApiKey?: boolean;
  /** Use account recovery server-to-server key instead of session cookie */
  useRecoveryApiKey?: boolean;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Restrict forwarded browser cookies to these names. */
  forwardedCookieNames?: readonly string[];
  /** Next.js fetch 캐시 모드. 미지정 시 'no-store' (기존 동작 유지) */
  cache?: RequestCache;
  /** Next.js ISR revalidate 시간(초). 설정 시 cache 옵션은 무시됨 */
  revalidate?: number;
  /** Next.js fetch 태그 (revalidateTag와 함께 사용) */
  tags?: string[];
}

export interface NestJSResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

export function getNestjsClientDiagnostics(): {
  apiKeySet: boolean;
  apiPrefix: string;
  baseUrl: string;
} {
  return {
    apiKeySet: Boolean(API_KEY),
    apiPrefix: API_PREFIX,
    baseUrl: NESTJS_API_URL,
  };
}

function createCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function routeTemplateForLog(endpoint: string): string {
  return endpoint
    .split('?')[0]
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      return SAFE_ROUTE_SEGMENTS.has(segment) ? segment : ':value';
    })
    .join('/');
}

function classifyConnectionFailure(errorMessage: string): string {
  if (errorMessage.includes('ECONNREFUSED')) return 'connection_refused';
  if (errorMessage.includes('ECONNRESET')) return 'connection_reset';
  if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('UND_ERR_CONNECT_TIMEOUT')) {
    return 'timeout';
  }
  if (errorMessage.includes('fetch failed')) return 'fetch_failed';
  return 'unknown';
}

/**
 * NestJS 백엔드 API를 직접 호출합니다 (Server-Side Only).
 * 세션 쿠키를 자동으로 전달합니다.
 */
export async function nestjsFetch<T>(
  endpoint: string,
  options: NestJSRequestOptions = {}
): Promise<NestJSResponse<T>> {
  const {
    method = 'GET',
    body,
    useApiKey = false,
    useRecoveryApiKey = false,
    headers: extraHeaders,
    forwardedCookieNames,
    cache,
    revalidate,
    tags,
  } = options;

  const url = `${NESTJS_API_URL}${API_PREFIX}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (useRecoveryApiKey) {
    const recoveryApiKey = getAccountRecoveryApiKey();
    if (!recoveryApiKey) {
      nestjsLogger.error('Account recovery API key is missing');
      return {
        ok: false,
        status: 503,
        data: {
          success: false,
          message: RECOVERY_API_KEY_MISSING_MESSAGE,
        } as T,
      };
    }

    headers['X-Account-Recovery-Key'] = recoveryApiKey;
  } else if (useApiKey && API_KEY) {
    headers['X-API-Key'] = API_KEY;
  } else {
    // Server Actions에서 쿠키 전달
    try {
      const cookieStore = await cookies();
      const allCookies = cookieStore
        .getAll()
        .filter((cookie) => !forwardedCookieNames || forwardedCookieNames.includes(cookie.name));
      const shouldForwardCsrf =
        !forwardedCookieNames || forwardedCookieNames.includes(CSRF_COOKIE_NAME);
      let csrfToken = shouldForwardCsrf ? cookieStore.get(CSRF_COOKIE_NAME)?.value : undefined;
      const hasForwardedSession = allCookies.some((cookie) =>
        SESSION_COOKIE_NAMES.includes(cookie.name)
      );

      if (isUnsafeMethod(method) && shouldForwardCsrf && hasForwardedSession && !csrfToken) {
        csrfToken = createCsrfToken();
        allCookies.push({ name: CSRF_COOKIE_NAME, value: csrfToken });
      }

      if (allCookies.length > 0) {
        headers['Cookie'] = buildForwardedCookieHeader(allCookies);
      }
      // CSRF 토큰을 헤더로 전송 (Double Submit Cookie 패턴)
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    } catch (error) {
      nestjsLogger.error('Browser credentials unavailable for scoped NestJS request', {
        routeTemplate: routeTemplateForLog(endpoint),
        method,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      return {
        ok: false,
        status: 401,
        data: { message: 'Session cookies unavailable' } as T,
      };
    }
  }

  const fetchOptions: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    method,
    headers,
  };

  const isReadMethod = method === 'GET' || method === 'HEAD';

  if (isReadMethod && revalidate !== undefined) {
    // ISR 캐시: revalidate가 설정되면 cache 옵션 생략 (Next.js 요구사항)
    fetchOptions.next = { revalidate };
    if (tags?.length) {
      fetchOptions.next.tags = tags;
    }
  } else {
    // 기본값: no-store (기존 동작 유지), 또는 호출자가 명시적으로 지정
    fetchOptions.cache = cache ?? 'no-store';
  }

  if (body && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = JSON.stringify(body);
  }

  // Retry config: connection errors only (not HTTP 4xx/5xx)
  const isDev = process.env.NODE_ENV !== 'production';
  const maxRetries = isDev ? 3 : 1;
  const baseDelayMs = 1000;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      const contentType = response.headers.get('content-type') || '';

      let data: T;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = (await response.text()) as unknown as T;
      }

      if (!response.ok) {
        nestjsLogger.warn('NestJS API error', {
          routeTemplate: routeTemplateForLog(endpoint),
          method,
          status: response.status,
          responseType: contentType.includes('application/json') ? 'json' : 'text',
        });
      }

      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const failureKind = classifyConnectionFailure(errorMessage);
      const isConnectionError = failureKind !== 'unknown';

      if (!isConnectionError || attempt >= maxRetries) {
        nestjsLogger.error('NestJS API connection failed', {
          routeTemplate: routeTemplateForLog(endpoint),
          method,
          attempt: attempt + 1,
          errorType: error instanceof Error ? error.name : typeof error,
          failureKind,
        });
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(errorMessage);
      const delayMs = baseDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s

      nestjsLogger.warn('NestJS API connection error, retrying', {
        routeTemplate: routeTemplateForLog(endpoint),
        method,
        attempt: attempt + 1,
        maxRetries,
        nextRetryMs: delayMs,
        errorType: error instanceof Error ? error.name : typeof error,
        failureKind,
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Should not reach here, but safety net
  throw lastError ?? new Error(`nestjsFetch failed after ${maxRetries} retries`);
}

function getAccountRecoveryApiKey(): string {
  const configuredKey = process.env.ACCOUNT_RECOVERY_API_KEY?.trim();
  if (configuredKey) {
    return configuredKey;
  }

  return '';
}
