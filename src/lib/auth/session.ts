// 세션 관리 유틸리티

import { cookies } from 'next/headers';
import crypto from 'crypto';
import { generateSessionToken } from './security';
import { getSessionSecret } from '@/lib/utils/env';
import { logger } from '@/lib/utils/logger';

const sessionLogger = logger.createLogger('Session');

const ADMIN_COOKIE_NAME = 'admin-session';
const COMPANY_COOKIE_NAME = 'company-session';
const CLOCK_SKEW_SECONDS = 300;

function getSessionCookieName(userType: 'admin' | 'company'): string {
  return userType === 'company' ? COMPANY_COOKIE_NAME : ADMIN_COOKIE_NAME;
}

// 세션 시크릿 캐싱 (모듈 레벨에서 한 번만 로드)
let cachedSessionSecret: string | null = null;
function getCachedSessionSecret(): string {
  if (!cachedSessionSecret) {
    cachedSessionSecret = getSessionSecret();
  }
  return cachedSessionSecret;
}
// 보안 강화: 기본 세션 만료 시간을 4시간으로 단축 (기존 24시간)
// 긴 세션은 세션 하이재킹 위험을 증가시킴
const SESSION_MAX_AGE = 60 * 60 * 4; // 4시간
export const PERSISTENT_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 자동로그인 30일

interface CreateSessionOptions {
  maxAge?: number;
}

interface BrowserSessionPayload {
  kind?: unknown;
  userType?: unknown;
  userId?: unknown;
  iat?: unknown;
  exp?: unknown;
}

interface BrowserSessionUser {
  userType: 'admin' | 'company';
  userId: string | number;
}

/**
 * 세션 토큰을 생성하고 쿠키에 저장합니다
 * @param userType - 사용자 타입 ('admin' | 'company')
 * @param userId - 사용자 ID (company의 경우 company id)
 */
export async function createSession(
  userType: 'admin' | 'company' = 'admin',
  userId?: number,
  options?: CreateSessionOptions
): Promise<string> {
  try {
    const token = generateSessionToken();
    const cookieStore = await cookies();

    const maxAge = options?.maxAge ?? SESSION_MAX_AGE;
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 토큰에 사용자 타입, ID, actor kind, 만료 정보를 포함하여 서명
    const sessionData = JSON.stringify({
      kind: 'browser',
      userType,
      userId: userType === 'admin' ? (userId ?? 'admin') : userId,
      iat: nowSeconds,
      exp: nowSeconds + maxAge,
    });
    const signedToken = signToken(`${token}:${sessionData}`);

    cookieStore.set(getSessionCookieName(userType), signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && process.env.USE_SECURE_COOKIES !== 'false',
      sameSite: 'lax',
      maxAge,
      path: '/',
      // COOKIE_DOMAIN 설정 시 서브도메인 간 쿠키 공유 (e.g., '.yjlaser.net')
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    });

    return token;
  } catch (error) {
    // 쿠키 설정 실패 시 에러를 다시 throw하여 호출자가 처리할 수 있도록 함
    sessionLogger.error('Browser credential creation failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    throw new Error(
      `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * 세션에서 사용자 타입과 ID를 가져옵니다
 */
export async function getSessionUser(): Promise<{
  userType: 'admin' | 'company';
  userId: string | number;
} | null> {
  const cookieStore = await cookies();

  // admin-session, company-session 순서로 확인
  for (const cookieName of [ADMIN_COOKIE_NAME, COMPANY_COOKIE_NAME]) {
    const sessionCookie = cookieStore.get(cookieName);
    if (!sessionCookie?.value) continue;

    try {
      const user = getVerifiedBrowserSessionUser(sessionCookie.value);
      if (user) return user;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * 세션 토큰을 검증합니다
 */
export async function verifySession(): Promise<boolean> {
  const cookieStore = await cookies();

  // admin-session 또는 company-session 중 하나라도 유효하면 true
  for (const cookieName of [ADMIN_COOKIE_NAME, COMPANY_COOKIE_NAME]) {
    const sessionCookie = cookieStore.get(cookieName);
    if (!sessionCookie?.value) continue;

    try {
      if (getVerifiedBrowserSessionUser(sessionCookie.value)) return true;
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * 세션을 삭제합니다 (로그아웃)
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  // 양쪽 쿠키 모두 삭제 (어느 타입으로 로그인했는지 확실하지 않을 수 있으므로)
  cookieStore.delete(ADMIN_COOKIE_NAME);
  cookieStore.delete(COMPANY_COOKIE_NAME);
}

/**
 * 세션 검증과 사용자 정보를 한 번에 가져옵니다 (성능 최적화)
 * verifySession() + getSessionUser()를 통합하여 쿠키 파싱을 1회로 줄임
 */
export async function verifyAndGetUser(): Promise<{
  isValid: boolean;
  user: { userType: 'admin' | 'company'; userId: string | number } | null;
}> {
  const cookieStore = await cookies();

  // admin-session, company-session 순서로 확인
  for (const cookieName of [ADMIN_COOKIE_NAME, COMPANY_COOKIE_NAME]) {
    const sessionCookie = cookieStore.get(cookieName);
    if (!sessionCookie?.value) continue;

    try {
      const user = getVerifiedBrowserSessionUser(sessionCookie.value);
      if (user) return { isValid: true, user };
    } catch {
      continue;
    }
  }

  return { isValid: false, user: null };
}

/**
 * 토큰에 서명을 추가합니다 (HMAC-SHA256 기반)
 * HMAC은 키와 메시지를 결합하여 더 안전한 서명을 생성합니다
 */
function signData(token: string, sessionSecret: string): string {
  // HMAC-SHA256 사용 (단순 해시보다 안전)
  const hmac = crypto.createHmac('sha256', sessionSecret);
  hmac.update(token);
  return hmac.digest('hex');
}

function signToken(token: string): string {
  // 캐시된 세션 시크릿 사용 (성능 최적화)
  const sessionSecret = getCachedSessionSecret();
  const signature = signData(token, sessionSecret);

  return `${token}.${signature}`;
}

/**
 * 타이밍 안전 문자열 비교
 * 타이밍 공격을 방지하기 위해 일정 시간 내에 비교를 완료합니다
 */
function timingSafeEqual(a: string, b: string): boolean {
  // 길이가 다르면 동일한 길이의 버퍼로 비교하여 타이밍 정보 노출 방지
  if (a.length !== b.length) {
    // 길이가 다른 경우에도 일정한 시간이 걸리도록 더미 비교 수행
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
 * 타이밍 안전 비교를 사용하여 타이밍 공격을 방지합니다
 */
function getVerificationSecrets(): string[] {
  const secrets = [getCachedSessionSecret()];
  const previous = process.env.SESSION_SECRET_PREVIOUS;
  const previousExpiresAt = process.env.SESSION_SECRET_PREVIOUS_EXPIRES_AT;

  if (previous && previousExpiresAt) {
    const expiresAt = Date.parse(previousExpiresAt);
    if (Number.isFinite(expiresAt) && Date.now() < expiresAt) {
      secrets.push(previous);
    }
  }

  return secrets;
}

function isLegacyCookieAllowed(): boolean {
  const compatUntil = process.env.SESSION_LEGACY_COOKIE_COMPAT_UNTIL;
  if (!compatUntil) return false;

  const timestamp = Date.parse(compatUntil);
  return Number.isFinite(timestamp) && Date.now() < timestamp;
}

function hasValidTimestamp(payload: BrowserSessionPayload): boolean {
  const iat = payload.iat;
  const exp = payload.exp;
  const hasIat = typeof iat === 'number' && Number.isFinite(iat);
  const hasExp = typeof exp === 'number' && Number.isFinite(exp);

  if (!hasIat || !hasExp) return isLegacyCookieAllowed();

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (exp <= nowSeconds) return false;
  if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return false;
  if (iat > exp) return false;

  return true;
}

function splitSignedToken(signedToken: string): { tokenAndData: string; signature: string } | null {
  const lastDotIdx = signedToken.lastIndexOf('.');
  if (lastDotIdx === -1) return null;

  const tokenAndData = signedToken.substring(0, lastDotIdx);
  const signature = signedToken.substring(lastDotIdx + 1);
  if (!tokenAndData || !signature) return null;

  return { tokenAndData, signature };
}

function verifySignedToken(signedToken: string): string | null {
  const parts = splitSignedToken(signedToken);
  if (!parts) return null;

  for (const sessionSecret of getVerificationSecrets()) {
    const expectedSignature = signData(parts.tokenAndData, sessionSecret);
    if (timingSafeEqual(parts.signature, expectedSignature)) return parts.tokenAndData;
  }

  return null;
}

function getVerifiedBrowserSessionUser(signedToken: string): BrowserSessionUser | null {
  const tokenAndData = verifySignedToken(signedToken);
  if (!tokenAndData) return null;

  const firstColonIndex = tokenAndData.indexOf(':');
  if (firstColonIndex === -1) return null;

  const token = tokenAndData.substring(0, firstColonIndex);
  const sessionDataStr = tokenAndData.substring(firstColonIndex + 1);
  if (!token || !sessionDataStr) return null;

  const sessionData = JSON.parse(sessionDataStr) as BrowserSessionPayload;
  if (!hasValidTimestamp(sessionData)) return null;
  if (sessionData.kind !== undefined && sessionData.kind !== 'browser') return null;
  if (sessionData.userType !== 'admin' && sessionData.userType !== 'company') return null;
  if (sessionData.userType === 'company' && typeof sessionData.userId !== 'number') return null;

  return {
    userType: sessionData.userType,
    userId:
      typeof sessionData.userId === 'string' || typeof sessionData.userId === 'number'
        ? sessionData.userId
        : 'admin',
  };
}
