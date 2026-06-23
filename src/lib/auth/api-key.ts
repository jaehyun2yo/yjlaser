/**
 * CLI용 API Key 인증
 *
 * 환경 변수: MIGRATION_API_KEY
 * 헤더: X-API-Key 또는 Authorization: Bearer <key>
 */

import { headers } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { logger } from '@/lib/utils/logger';

const apiKeyLogger = logger.createLogger('API_KEY_AUTH');

/**
 * 타이밍-안전 문자열 비교
 * 타이밍 공격을 방지하기 위해 일정한 시간에 비교 수행
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 길이가 다르면 더미 비교 수행 후 false 반환 (일정한 시간 유지)
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * API Key 검증
 * 세션 인증이 실패했을 때 대체 인증으로 사용
 */
export async function verifyApiKey(): Promise<{
  isValid: boolean;
  error?: string;
}> {
  const expectedKey = process.env.MIGRATION_API_KEY;

  if (!expectedKey) {
    apiKeyLogger.warn('Migration credential not configured');
    return { isValid: false, error: 'API Key not configured on server' };
  }

  const headersList = await headers();
  const apiKey =
    headersList.get('x-api-key') || headersList.get('authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    return { isValid: false, error: 'API Key not provided' };
  }

  if (!timingSafeCompare(apiKey, expectedKey)) {
    apiKeyLogger.warn('Invalid API Key attempt');
    return { isValid: false, error: 'Invalid API Key' };
  }

  return { isValid: true };
}

interface SessionUser {
  userId: number | string;
  userType: 'admin' | 'company' | string;
}

interface SessionCheckResult {
  isValid: boolean;
  user: SessionUser | null;
}

/**
 * 세션 또는 API Key로 인증
 * CLI와 웹 대시보드 모두 지원
 */
export async function verifySessionOrApiKey(
  sessionCheck: () => Promise<SessionCheckResult>
): Promise<{
  isValid: boolean;
  user?: SessionUser;
  authMethod: 'session' | 'api-key' | 'none';
  error?: string;
}> {
  // 1. 먼저 세션 확인
  const sessionResult = await sessionCheck();
  if (sessionResult.isValid && sessionResult.user) {
    return {
      isValid: true,
      user: sessionResult.user,
      authMethod: 'session',
    };
  }

  // 2. 세션 실패 시 API Key 확인
  const apiKeyResult = await verifyApiKey();
  if (apiKeyResult.isValid) {
    // API Key 인증 성공 시 가상의 관리자 사용자 반환
    return {
      isValid: true,
      user: {
        userId: 0, // CLI 사용자
        userType: 'admin' as const,
      },
      authMethod: 'api-key',
    };
  }

  return {
    isValid: false,
    authMethod: 'none',
    error: 'Authentication required. Provide session cookie or API Key.',
  };
}
