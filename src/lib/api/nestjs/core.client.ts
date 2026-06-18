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
const DEVELOPMENT_ACCOUNT_RECOVERY_API_KEY = 'yjlaser-dev-account-recovery-key';
const RECOVERY_API_KEY_MISSING_MESSAGE =
  '계정 복구 설정이 누락되었습니다. 관리자에게 문의해주세요.';
const CSRF_COOKIE_NAME = 'csrf-token';
const SESSION_COOKIE_NAMES = ['admin-session', 'company-session', 'worker-session', 'erp-session'];

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
      nestjsLogger.error('Session cookies unavailable for session-scoped NestJS request', {
        endpoint,
        method,
        error: error instanceof Error ? error.message : 'Unknown error',
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
          endpoint,
          method,
          status: response.status,
          data,
        });
      }

      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isConnectionError =
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('UND_ERR_CONNECT_TIMEOUT');

      if (!isConnectionError || attempt >= maxRetries) {
        nestjsLogger.error('NestJS API connection failed', {
          endpoint,
          method,
          attempt: attempt + 1,
          error: errorMessage,
        });
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(errorMessage);
      const delayMs = baseDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s

      nestjsLogger.warn('NestJS API connection error, retrying', {
        endpoint,
        method,
        attempt: attempt + 1,
        maxRetries,
        nextRetryMs: delayMs,
        error: errorMessage,
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

  if (process.env.NODE_ENV === 'development' && isLocalNestjsUrl(NESTJS_API_URL)) {
    return DEVELOPMENT_ACCOUNT_RECOVERY_API_KEY;
  }

  return '';
}

function isLocalNestjsUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
  } catch {
    return false;
  }
}
