import { NextRequest, NextResponse } from 'next/server';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger, toSafeLogError } from '@/lib/utils/logger';

const resetPasswordLogger = logger.createLogger('RESET_PASSWORD');

interface PasswordResetResponse {
  success: boolean;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: unknown;
      password?: unknown;
      passwordConfirm?: unknown;
    };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : '';

    if (!token || !password || !passwordConfirm) {
      return NextResponse.json(
        { success: false, message: '모든 필드를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (password !== passwordConfirm) {
      return NextResponse.json(
        { success: false, message: '비밀번호가 일치하지 않습니다.' },
        { status: 400 }
      );
    }

    const response = await nestjsFetch<PasswordResetResponse>('/auth/password-reset/confirm', {
      method: 'POST',
      body: { token, password },
      useRecoveryApiKey: true,
    });

    if (!response.ok) {
      resetPasswordLogger.warn('Credential reset confirm failed', {
        status: response.status,
      });
      const message =
        typeof response.data?.message === 'string'
          ? response.data.message
          : '비밀번호 재설정에 실패했습니다.';

      return NextResponse.json({ success: false, message }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      message: response.data.message,
    });
  } catch (error) {
    resetPasswordLogger.error('Credential reset route failed', toSafeLogError(error));
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
