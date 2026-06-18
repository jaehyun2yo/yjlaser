import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { logger } from '@/lib/utils/logger';
import { getSessionSecret } from '@/lib/utils/env';
import { getErpWorkerSession, type ErpWorkerSession } from '@/lib/auth/erp-session';

const erpLogger = logger.createLogger('ERPSession');

const ERP_SESSION_COOKIE_NAME = 'erp-session';
const CSRF_COOKIE_NAME = 'csrf-token';
const SESSION_MAX_AGE = 60 * 60 * 8; // 8시간 (모바일 작업 시간 고려)
const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

interface PinLoginSuccessResponse {
  success: true;
  worker: {
    id: string;
    name: string;
    role?: string;
    worker_type?: string | null;
  };
  message?: string;
}

interface PinLoginFailureResponse {
  success: false;
  worker: null;
  message: string;
  reason?: string;
  retry_after_seconds?: number;
}

type PinLoginResponse = PinLoginSuccessResponse | PinLoginFailureResponse;

// 세션 시크릿 캐싱
let cachedSessionSecret: string | null = null;
function getCachedSessionSecret(): string {
  if (!cachedSessionSecret) {
    cachedSessionSecret = getSessionSecret();
  }
  return cachedSessionSecret;
}

/**
 * 토큰에 서명을 추가합니다 (HMAC-SHA256 기반)
 */
function signToken(token: string): string {
  const sessionSecret = getCachedSessionSecret();
  const hmac = crypto.createHmac('sha256', sessionSecret);
  hmac.update(token);
  const signature = hmac.digest('hex');
  return `${token}.${signature}`;
}

function createCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 타이밍 안전 문자열 비교
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const dummyBuffer = Buffer.from(a);
    crypto.timingSafeEqual(dummyBuffer, dummyBuffer);
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 서명된 토큰을 검증합니다
 */
function verifySignedToken(signedToken: string): boolean {
  const lastDotIdx = signedToken.lastIndexOf('.');
  if (lastDotIdx === -1) return false;

  const token = signedToken.substring(0, lastDotIdx);
  const signature = signedToken.substring(lastDotIdx + 1);

  if (!token || !signature) {
    return false;
  }

  const expectedSignature = signToken(token).split('.')[1];
  if (!expectedSignature) {
    return false;
  }

  return timingSafeEqual(signature, expectedSignature);
}

/**
 * POST: ERP 세션 생성 (PIN 인증 성공 후 호출)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, pin } = body as { name?: unknown; pin?: unknown };

    if (typeof name !== 'string' || !name.trim() || typeof pin !== 'string' || !pin.trim()) {
      return NextResponse.json(
        { success: false, error: '이름과 PIN 인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const upstreamHeaders: HeadersInit = {
      'Content-Type': 'application/json',
    };
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');
    if (forwardedFor) upstreamHeaders['x-forwarded-for'] = forwardedFor;
    if (realIp) upstreamHeaders['x-real-ip'] = realIp;
    if (userAgent) upstreamHeaders['user-agent'] = userAgent;

    const pinLoginResponse = await fetch(`${NESTJS_API_URL}/api/v1/erp/workers/pin-login`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify({ name: name.trim(), pin }),
    });

    const pinLoginData = (await pinLoginResponse.json().catch(() => ({
      success: false,
      worker: null,
      message: 'PIN 인증에 실패했습니다.',
    }))) as PinLoginResponse;

    if (!pinLoginResponse.ok || !pinLoginData.success || !pinLoginData.worker) {
      return NextResponse.json(pinLoginData, { status: pinLoginResponse.status || 401 });
    }

    // 세션 토큰 생성
    const token = crypto.randomBytes(32).toString('hex');
    const workerSession: ErpWorkerSession = {
      workerId: pinLoginData.worker.id,
      workerName: pinLoginData.worker.name,
      role: pinLoginData.worker.role,
      workerType: pinLoginData.worker.worker_type ?? null,
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sessionData = JSON.stringify({
      ...workerSession,
      kind: 'worker',
      iat: nowSeconds,
      exp: nowSeconds + SESSION_MAX_AGE,
    });
    const signedToken = signToken(`${token}:${sessionData}`);

    // 쿠키 설정
    const cookieStore = await cookies();
    cookieStore.set(ERP_SESSION_COOKIE_NAME, signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && process.env.USE_SECURE_COOKIES !== 'false',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });
    cookieStore.set(CSRF_COOKIE_NAME, createCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production' && process.env.USE_SECURE_COOKIES !== 'false',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    erpLogger.info('ERP 세션 생성 성공', {
      workerId: workerSession.workerId,
      workerName: workerSession.workerName,
    });

    return NextResponse.json({
      success: true,
      message: '세션이 생성되었습니다.',
      worker: pinLoginData.worker,
    });
  } catch (error) {
    erpLogger.error('ERP 세션 생성 실패', error);
    return NextResponse.json(
      { success: false, error: '세션 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET: 현재 세션 검증
 */
export async function GET() {
  try {
    const session = await getErpWorkerSession();
    if (!session) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        error: '세션이 없거나 유효하지 않습니다.',
      });
    }

    const cookieStore = await cookies();
    if (!cookieStore.get(CSRF_COOKIE_NAME)?.value) {
      cookieStore.set(CSRF_COOKIE_NAME, createCsrfToken(), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && process.env.USE_SECURE_COOKIES !== 'false',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      worker: {
        id: session.workerId,
        name: session.workerName,
        role: session.role,
        worker_type: session.workerType ?? null,
      },
    });
  } catch (error) {
    erpLogger.error('ERP 세션 검증 실패', error);
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: '세션 검증 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 세션 삭제 (로그아웃)
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(ERP_SESSION_COOKIE_NAME);
    cookieStore.delete(CSRF_COOKIE_NAME);

    erpLogger.info('ERP 세션 삭제 성공');

    return NextResponse.json({
      success: true,
      message: '로그아웃되었습니다.',
    });
  } catch (error) {
    erpLogger.error('ERP 세션 삭제 실패', error);
    return NextResponse.json(
      { success: false, error: '로그아웃 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
