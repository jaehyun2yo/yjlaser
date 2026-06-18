'use server';

import {
  destroySession,
  createSession,
  getSessionUser,
  PERSISTENT_SESSION_MAX_AGE,
} from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/security';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/utils/logger';
import { logActivity } from '@/lib/activity-logger';
import { headers } from 'next/headers';
import {
  recordLoginAttemptFromHeaders,
  recordFailedUsername,
  resetLoginAttemptsByIP,
} from '@/lib/auth/rateLimit';

function getLoginNextPath(formData: FormData): string | null {
  const rawNext = formData.get('next');
  if (typeof rawNext !== 'string') return null;

  if (
    rawNext.startsWith('/admin') ||
    rawNext.startsWith('/company') ||
    rawNext.startsWith('/webhard')
  ) {
    return rawNext;
  }

  return null;
}

function loginErrorRedirectUrl(
  error: 'invalid' | 'rate_limit' | 'pending_approval' | 'server',
  nextPath: string | null,
  extraParams?: Record<string, string>
): string {
  const params = new URLSearchParams({ error });
  if (nextPath) params.set('next', nextPath);

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      params.set(key, value);
    }
  }

  return `/login?${params.toString()}`;
}

/**
 * 로그아웃 서버 액션
 */
export async function logoutAction() {
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  try {
    // 세션 정보를 로그아웃 전에 가져옴
    const user = await getSessionUser();

    // 세션 삭제
    await destroySession();

    // 활동 로그 기록
    if (user) {
      await logActivity({
        actorType: user.userType,
        actorId: String(user.userId),
        actorName: user.userType === 'admin' ? 'Admin' : `Company ${user.userId}`,
        action: 'LOGOUT',
        ipAddress: ip,
        userAgent: userAgent,
        details: { userType: user.userType },
      });
    }
  } catch (error) {
    const authLogger = logger.createLogger('AUTH');
    authLogger.error('Logout error', error);
  }

  redirect('/');
}

/**
 * 로그인 서버 액션
 *
 * 관리자 및 기업 계정 로그인을 처리합니다.
 *
 * @param formData - FormData 객체 (username, password 포함)
 *
 * @remarks
 * - 관리자 계정: 환경 변수에서 확인
 * - 기업 계정: companies 테이블에서 확인
 * - 성공 시 세션 쿠키 설정 및 리디렉션
 *
 * @example
 * ```typescript
 * const formData = new FormData();
 * formData.append('username', 'admin');
 * formData.append('password', 'password123');
 *
 * await loginAction(formData);
 * ```
 */
export async function loginAction(formData: FormData) {
  'use server';

  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  const nextPath = getLoginNextPath(formData);
  const autoLogin = formData.get('autoLogin') === 'on';
  const sessionOptions = autoLogin ? { maxAge: PERSISTENT_SESSION_MAX_AGE } : undefined;

  if (!username || !password) {
    redirect(loginErrorRedirectUrl('invalid', nextPath));
  }

  const authLogger = logger.createLogger('AUTH');
  const headersList = await headers();

  // Rate Limiting 체크
  const rateLimitResult = await recordLoginAttemptFromHeaders(headersList);

  if (!rateLimitResult.allowed) {
    const lockoutMinutes = rateLimitResult.lockedUntil
      ? Math.ceil((rateLimitResult.lockedUntil - Date.now()) / 1000 / 60)
      : 15;

    authLogger.warn(`Login blocked due to rate limiting`, {
      ip: rateLimitResult.ip,
      lockoutMinutes,
    });

    // 로그인 시도 차단 로그 기록
    await logActivity({
      actorType: 'company',
      actorId: 'unknown',
      actorName: username,
      action: 'LOGIN_BLOCKED',
      ipAddress: rateLimitResult.ip,
      userAgent: headersList.get('user-agent') || 'unknown',
      details: {
        reason: 'rate_limit_exceeded',
        lockoutMinutes,
        username,
      },
    });

    redirect(loginErrorRedirectUrl('rate_limit', nextPath, { minutes: String(lockoutMinutes) }));
  }

  try {
    // 1. 먼저 관리자 계정 확인
    // 보안: 환경변수 미설정 시 기본값 사용하지 않음 (하드코딩된 비밀번호 해시 제거)
    const testAdminUsername = process.env.TEST_ADMIN_USERNAME;
    const testAdminPasswordHashB64 = process.env.TEST_ADMIN_PASSWORD_HASH_B64;
    const testAdminPasswordHash = testAdminPasswordHashB64
      ? Buffer.from(testAdminPasswordHashB64, 'base64').toString('utf8')
      : undefined;
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    // 환경변수가 설정되지 않은 경우 관리자 로그인 비활성화
    const currentAdminUsername = testAdminUsername || adminUsername;
    const currentAdminPasswordHash = testAdminPasswordHash || adminPasswordHash;

    // 관리자 계정 확인 (환경변수가 설정된 경우에만)
    if (
      currentAdminUsername &&
      currentAdminPasswordHash &&
      username.trim() === currentAdminUsername
    ) {
      const isValidPassword = await verifyPassword(password, currentAdminPasswordHash);
      if (isValidPassword) {
        try {
          // 로그인 성공 - Rate Limit 초기화
          await resetLoginAttemptsByIP(rateLimitResult.ip);

          await createSession('admin', undefined, sessionOptions);
          authLogger.info('Admin login successful', { username });

          await logActivity({
            actorType: 'admin',
            actorId: 'admin',
            actorName: username,
            action: 'LOGIN',
            ipAddress: rateLimitResult.ip,
            userAgent: headersList.get('user-agent') || 'unknown',
            details: { username },
          });

          redirect('/admin');
        } catch (sessionError) {
          // NEXT_REDIRECT 에러는 다시 throw
          if (sessionError instanceof Error) {
            const errorDigest = (sessionError as { digest?: string }).digest;
            if (
              sessionError.message === 'NEXT_REDIRECT' ||
              errorDigest?.startsWith('NEXT_REDIRECT')
            ) {
              throw sessionError;
            }
          }
          authLogger.error('Session creation failed', sessionError);
          redirect(loginErrorRedirectUrl('server', nextPath));
        }
      } else {
        authLogger.debug('Invalid admin password', { username });

        // 실패한 사용자명 기록 (공격 패턴 분석용)
        recordFailedUsername(rateLimitResult.ip, username);

        // 로그인 실패 로그 기록
        await logActivity({
          actorType: 'admin',
          actorId: 'admin',
          actorName: username,
          action: 'LOGIN_FAILED',
          ipAddress: rateLimitResult.ip,
          userAgent: headersList.get('user-agent') || 'unknown',
          details: {
            username,
            reason: 'invalid_password',
            accountType: 'admin',
            remainingAttempts: rateLimitResult.remainingAttempts,
          },
        });

        redirect(loginErrorRedirectUrl('invalid', nextPath));
      }
    }

    // 2. 기업 계정 확인 (NestJS API 경유)
    const { serverGetCompanyForAuth } = await import('@/lib/api/nestjs-server-client');
    const company = await serverGetCompanyForAuth(username.trim());

    if (!company) {
      authLogger.debug('Company not found', { username });

      // 실패한 사용자명 기록
      recordFailedUsername(rateLimitResult.ip, username);

      // 존재하지 않는 계정 로그인 시도 기록
      await logActivity({
        actorType: 'company',
        actorId: 'unknown',
        actorName: username,
        action: 'LOGIN_FAILED',
        ipAddress: rateLimitResult.ip,
        userAgent: headersList.get('user-agent') || 'unknown',
        details: {
          username,
          reason: 'account_not_found',
          remainingAttempts: rateLimitResult.remainingAttempts,
        },
      });

      redirect(loginErrorRedirectUrl('invalid', nextPath));
    }

    // 승인 여부 확인
    // 관리자 승인을 받지 않은 계정은 로그인 불가
    if (company.is_approved === false) {
      authLogger.debug('Company account not approved', {
        username,
        companyId: company.id,
        status: company.status,
      });

      // 실패한 사용자명 기록
      recordFailedUsername(rateLimitResult.ip, username);

      // 미승인 계정 로그인 시도 기록
      await logActivity({
        actorType: 'company',
        actorId: String(company.id),
        actorName: company.company_name,
        action: 'LOGIN_FAILED',
        ipAddress: rateLimitResult.ip,
        userAgent: headersList.get('user-agent') || 'unknown',
        details: {
          username,
          reason: 'account_not_approved', // 서버 로그에서만 확인 가능
          companyId: company.id,
          status: company.status,
          remainingAttempts: rateLimitResult.remainingAttempts,
        },
      });

      // 미승인 계정은 별도의 안내 메시지 (사용자 경험 고려)
      redirect(loginErrorRedirectUrl('pending_approval', nextPath));
    }

    // 계정 상태 확인
    // 보안: 비활성 계정도 invalid로 응답하여 계정 상태 노출 방지 (User Enumeration Attack 방지)
    if (company.status !== 'active') {
      authLogger.debug('Company account inactive', { username, status: company.status });

      // 실패한 사용자명 기록
      recordFailedUsername(rateLimitResult.ip, username);

      // 비활성 계정 로그인 시도 기록 (서버 로그에는 상세 정보 기록)
      await logActivity({
        actorType: 'company',
        actorId: String(company.id),
        actorName: company.company_name,
        action: 'LOGIN_FAILED',
        ipAddress: rateLimitResult.ip,
        userAgent: headersList.get('user-agent') || 'unknown',
        details: {
          username,
          reason: 'account_inactive', // 서버 로그에서만 확인 가능
          status: company.status,
          remainingAttempts: rateLimitResult.remainingAttempts,
        },
      });

      // 보안: invalid로 통일하여 계정 존재/상태 노출 방지
      redirect(loginErrorRedirectUrl('invalid', nextPath));
    }

    // 비밀번호 검증 (bcryptjs는 이미 병렬 처리됨)
    const isValidPassword = await verifyPassword(password, company.password_hash);
    if (!isValidPassword) {
      authLogger.debug('Invalid password for company', { username });

      // 실패한 사용자명 기록
      recordFailedUsername(rateLimitResult.ip, username);

      // 비밀번호 오류 로그인 시도 기록
      await logActivity({
        actorType: 'company',
        actorId: String(company.id),
        actorName: company.company_name,
        action: 'LOGIN_FAILED',
        ipAddress: rateLimitResult.ip,
        userAgent: headersList.get('user-agent') || 'unknown',
        details: {
          username,
          reason: 'invalid_password',
          companyId: company.id,
          remainingAttempts: rateLimitResult.remainingAttempts,
        },
      });

      redirect(loginErrorRedirectUrl('invalid', nextPath));
    }

    // 로그인 성공 - 기업 세션 생성
    try {
      // Rate Limit 초기화
      await resetLoginAttemptsByIP(rateLimitResult.ip);

      await createSession('company', company.id, sessionOptions);
      authLogger.info('Company login successful', { username, companyId: company.id });

      await logActivity({
        actorType: 'company',
        actorId: String(company.id),
        actorName: company.company_name,
        action: 'LOGIN',
        ipAddress: rateLimitResult.ip,
        userAgent: headersList.get('user-agent') || 'unknown',
        details: { username, companyId: company.id },
      });

      redirect('/company/dashboard');
    } catch (sessionError) {
      // NEXT_REDIRECT 에러는 다시 throw
      if (sessionError instanceof Error) {
        const errorDigest = (sessionError as { digest?: string }).digest;
        if (sessionError.message === 'NEXT_REDIRECT' || errorDigest?.startsWith('NEXT_REDIRECT')) {
          throw sessionError;
        }
      }
      authLogger.error('Session creation failed', sessionError);
      redirect(loginErrorRedirectUrl('server', nextPath));
    }
  } catch (error: unknown) {
    // Next.js의 redirect()는 NEXT_REDIRECT 에러를 throw합니다.
    // 이것은 정상적인 동작이므로 다시 throw해야 합니다.
    // Next.js가 이를 자동으로 처리하여 리다이렉트를 수행합니다.
    if (error instanceof Error) {
      const errorDigest = (error as { digest?: string }).digest;
      // NEXT_REDIRECT는 Next.js가 내부적으로 처리하는 특수 에러입니다.
      // 이것을 다시 throw하면 Next.js가 리다이렉트를 처리합니다.
      if (error.message === 'NEXT_REDIRECT' || errorDigest?.startsWith('NEXT_REDIRECT')) {
        throw error;
      }
    }

    // 다른 에러는 로깅하고 서버 에러로 리다이렉트
    if (authLogger) {
      authLogger.error('Login error', error);
    }
    redirect(loginErrorRedirectUrl('server', nextPath));
  }
}
