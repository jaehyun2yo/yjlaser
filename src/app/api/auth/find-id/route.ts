import { NextRequest, NextResponse } from 'next/server';
import { checkAccountRecoveryRateLimit } from '@/lib/auth/rateLimit';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const findIdLogger = logger.createLogger('FIND_ID');

interface FindIdResponse {
  success: boolean;
  message: string;
}

const FIND_ID_SUCCESS_MESSAGE =
  '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.';

const RATE_LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * 아이디 찾기 API
 *
 * 업체명, 이메일, 연락처가 일치하면 등록 이메일로 아이디 안내 메일 발송을 요청합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyName?: unknown;
      email?: unknown;
      phone?: unknown;
    };
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : '';

    if (!companyName || !email || !phone) {
      return NextResponse.json(
        { success: false, message: '모든 필드를 올바르게 입력해주세요.' },
        { status: 400 }
      );
    }

    if (
      companyName.length > 100 ||
      email.length > 254 ||
      phone.length < 9 ||
      phone.length > 15 ||
      hasControlCharacters(companyName) ||
      !isValidEmail(email)
    ) {
      return NextResponse.json(
        { success: false, message: '모든 필드를 올바르게 입력해주세요.' },
        { status: 400 }
      );
    }

    const rateLimit = await checkAccountRecoveryRateLimit(request, {
      flow: 'find-id',
      fields: [companyName, email, phone],
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: rateLimit.message || RATE_LIMIT_MESSAGE },
        { status: rateLimit.status || 429 }
      );
    }

    const response = await nestjsFetch<FindIdResponse>('/auth/find-id/request', {
      method: 'POST',
      body: { companyName, email, phone },
      useRecoveryApiKey: true,
      headers: {
        'X-Account-Recovery-Client-IP': rateLimit.ip,
        'X-Account-Recovery-Fingerprint': rateLimit.fingerprint,
      },
    });

    if (!response.ok) {
      findIdLogger.error('Find ID request failed', {
        status: response.status,
      });
      const message =
        typeof response.data?.message === 'string'
          ? response.data.message
          : '아이디 안내 메일 요청에 실패했습니다.';

      return NextResponse.json({ success: false, message }, { status: response.status });
    }

    return NextResponse.json(
      {
        success: true,
        message: response.data.message || FIND_ID_SUCCESS_MESSAGE,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    findIdLogger.error('Find ID error', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
