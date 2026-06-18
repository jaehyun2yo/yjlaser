/**
 * 관리자 권한 검사 유틸리티
 *
 * 관리자 전용 API에서 사용하는 공통 권한 검사 로직
 */

import { NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';

const guardLogger = logger.createLogger('ADMIN_GUARD');

export interface AdminGuardResult {
  authorized: boolean;
  user: {
    userId: string | number;
    userType: 'admin' | 'company';
  } | null;
  response?: NextResponse;
}

/**
 * 관리자 권한 검사
 *
 * @returns AdminGuardResult - 권한 검사 결과
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const guardResult = await requireAdmin();
 *   if (!guardResult.authorized) {
 *     return guardResult.response;
 *   }
 *   // 관리자 전용 로직...
 * }
 * ```
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  // 1. 세션 검증
  const isAuthenticated = await verifySession();
  if (!isAuthenticated) {
    guardLogger.warn('Unauthorized access attempt - no valid session');
    return {
      authorized: false,
      user: null,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  // 2. 사용자 정보 조회
  const user = await getSessionUser();
  if (!user?.userId) {
    guardLogger.warn('Unauthorized access attempt - no user in session');
    return {
      authorized: false,
      user: null,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  // 3. 관리자 권한 확인
  if (user.userType !== 'admin') {
    guardLogger.warn('Forbidden access attempt - not admin', {
      userId: user.userId,
      userType: user.userType,
    });
    return {
      authorized: false,
      user,
      response: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }),
    };
  }

  return {
    authorized: true,
    user,
  };
}

/**
 * 인증된 사용자 권한 검사 (관리자 또는 회사)
 *
 * @returns AdminGuardResult - 권한 검사 결과
 */
export async function requireAuth(): Promise<AdminGuardResult> {
  const isAuthenticated = await verifySession();
  if (!isAuthenticated) {
    return {
      authorized: false,
      user: null,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  const user = await getSessionUser();
  if (!user?.userId) {
    return {
      authorized: false,
      user: null,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  return {
    authorized: true,
    user,
  };
}

/**
 * 회사 권한 검사
 *
 * @returns AdminGuardResult - 권한 검사 결과
 */
export async function requireCompany(): Promise<AdminGuardResult> {
  const isAuthenticated = await verifySession();
  if (!isAuthenticated) {
    return {
      authorized: false,
      user: null,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  const user = await getSessionUser();
  if (!user?.userId) {
    return {
      authorized: false,
      user: null,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  if (user.userType !== 'company') {
    return {
      authorized: false,
      user,
      response: NextResponse.json({ error: '업체 권한이 필요합니다.' }, { status: 403 }),
    };
  }

  return {
    authorized: true,
    user,
  };
}
