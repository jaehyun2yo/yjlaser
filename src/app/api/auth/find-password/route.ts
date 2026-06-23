import { NextRequest, NextResponse } from 'next/server';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { checkAccountRecoveryRateLimit } from '@/lib/auth/rateLimit';
import { logger, toSafeLogError } from '@/lib/utils/logger';

const findPasswordLogger = logger.createLogger('FIND_PASSWORD');

interface PasswordResetResponse {
  success: boolean;
  message: string;
}

const RATE_LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * 비밀번호 찾기 API
 *
 * 아이디와 이메일을 NestJS reset-link 발급 흐름으로 전달합니다.
 * 이 route는 비밀번호나 reset token을 생성하거나 응답하지 않습니다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username?: unknown; email?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';

    if (!username || !email) {
      return NextResponse.json(
        { success: false, message: '모든 필드를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (username.length > 100 || email.length > 254 || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, message: '아이디와 이메일을 올바르게 입력해주세요.' },
        { status: 400 }
      );
    }

    const rateLimit = await checkAccountRecoveryRateLimit(request, {
      flow: 'find-password',
      fields: [username, email],
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: rateLimit.message || RATE_LIMIT_MESSAGE },
        { status: rateLimit.status || 429 }
      );
    }

    const response = await nestjsFetch<PasswordResetResponse>('/auth/password-reset/request', {
      method: 'POST',
      body: { username, email },
      useRecoveryApiKey: true,
      headers: {
        'X-Account-Recovery-Client-IP': rateLimit.ip,
        'X-Account-Recovery-Fingerprint': rateLimit.fingerprint,
        'X-Account-Recovery-Origin': request.nextUrl.origin,
      },
    });

    if (!response.ok) {
      findPasswordLogger.error('Account recovery request failed', {
        status: response.status,
      });
      const message =
        typeof response.data?.message === 'string'
          ? response.data.message
          : '비밀번호 재설정 메일 전송에 실패했습니다.';

      return NextResponse.json({ success: false, message }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      message: response.data.message,
    });
  } catch (error) {
    findPasswordLogger.error('Account recovery route failed', toSafeLogError(error));
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
