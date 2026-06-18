// 로그인 시도 제한 (Rate Limiting)
// Upstash Redis 기반 분산 Rate Limiting (프로덕션)
// 메모리 기반 폴백 (개발 환경)

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createHash, createHmac } from 'crypto';
import { logger } from '@/lib/utils/logger';

const rateLimitLogger = logger.createLogger('RateLimit');

// Upstash Redis 클라이언트 (환경변수가 있을 때만)
let redis: Redis | null = null;
let ratelimit: Ratelimit | null = null;

// Upstash 환경변수 확인 및 초기화
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// 웹하드 API Rate Limiter
let webhardRatelimit: Ratelimit | null = null;
const accountRecoveryRatelimits = new Map<string, Ratelimit>();

if (UPSTASH_URL && UPSTASH_TOKEN) {
  try {
    redis = new Redis({
      url: UPSTASH_URL,
      token: UPSTASH_TOKEN,
    });

    // Sliding window: IP당 5회/15분 (로그인)
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      analytics: true,
      prefix: 'ratelimit:login',
    });

    // 🔒 웹하드 API Rate Limiter: IP당 100회/분
    webhardRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      analytics: true,
      prefix: 'ratelimit:webhard',
    });

    rateLimitLogger.info('✅ Upstash Rate Limiting initialized (login + webhard)');
  } catch (error) {
    rateLimitLogger.error('Failed to initialize Upstash Rate Limiting', error);
  }
}

// ============================================================================
// Fallback: 메모리 기반 Rate Limiting (개발 환경)
// ============================================================================

interface AttemptRecord {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
  failedUsernames: Set<string>;
}

const attempts = new Map<string, AttemptRecord>();

// 프로덕션에서 메모리 기반 사용 시 경고
if (process.env.NODE_ENV === 'production' && !ratelimit) {
  rateLimitLogger.warn(
    '⚠️ Rate Limiting is using in-memory storage. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production.'
  );
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15분
const RESET_DURATION = 60 * 60 * 1000; // 1시간
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5분

// 신뢰할 수 있는 프록시 헤더 목록
const TRUSTED_PROXY_HEADERS = ['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip'];

/**
 * IP 주소 형식 검증 (IPv4, IPv6)
 */
function isValidIP(ip: string): boolean {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^([a-fA-F0-9:]+)$/;

  if (ipv4Pattern.test(ip)) {
    const parts = ip.split('.');
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  return ipv6Pattern.test(ip);
}

/**
 * 안전하게 IP 주소를 추출합니다
 */
function getClientIdentifier(request: Request): string {
  for (const header of TRUSTED_PROXY_HEADERS) {
    const value = request.headers.get(header);
    if (value) {
      const ip = value.split(',')[0]?.trim();
      if (ip && isValidIP(ip)) {
        return ip;
      }
    }
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0]?.trim();
    if (ip && isValidIP(ip)) {
      return ip;
    }
  }

  return 'unknown';
}

/**
 * Headers 객체에서 안전하게 IP 주소를 추출합니다
 */
export function getClientIPFromHeaders(headers: Headers): string {
  for (const header of TRUSTED_PROXY_HEADERS) {
    const value = headers.get(header);
    if (value) {
      const ip = value.split(',')[0]?.trim();
      if (ip && isValidIP(ip)) {
        return ip;
      }
    }
  }

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0]?.trim();
    if (ip && isValidIP(ip)) {
      return ip;
    }
  }

  return 'unknown';
}

// ============================================================================
// 주기적으로 오래된 레코드 정리 (메모리 기반)
// ============================================================================

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval || ratelimit) return; // Upstash 사용 시 불필요

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of attempts.entries()) {
      if (now - record.lastAttempt > RESET_DURATION) {
        attempts.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      rateLimitLogger.debug(`Cleaned up ${cleaned} expired rate limit records`);
    }
  }, CLEANUP_INTERVAL);
}

// 메모리 기반 사용 시에만 정리 작업 시작
if (!ratelimit) {
  startCleanup();
}

// ============================================================================
// Rate Limiting API
// ============================================================================

interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  lockedUntil?: number;
  ip: string;
}

export interface AccountRecoveryRateLimitInput {
  flow: 'find-id' | 'find-password';
  fields: string[];
}

export interface AccountRecoveryRateLimitResult extends RateLimitResult {
  fingerprint: string;
  status?: 429 | 503;
  message?: string;
}

/**
 * Upstash 기반 Rate Limiting 체크
 *
 * 개발 환경(NODE_ENV !== 'production')에서는 항상 통과시킵니다.
 * 로컬 개발 중 반복 로그인 시도로 차단되는 불편을 제거하기 위한 조치이며,
 * 프로덕션에서는 정상적으로 5회/15분 제한이 적용됩니다.
 */
async function checkUpstashRateLimit(identifier: string): Promise<RateLimitResult> {
  if (process.env.NODE_ENV !== 'production') {
    return {
      allowed: true,
      remainingAttempts: Number.MAX_SAFE_INTEGER,
      ip: identifier,
    };
  }

  if (!ratelimit) {
    return recordLoginAttemptInMemory(identifier);
  }

  try {
    const result = await ratelimit.limit(identifier);

    if (!result.success) {
      rateLimitLogger.warn(`Rate limit exceeded for IP ${identifier}`);
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: Date.now() + result.reset,
        ip: identifier,
      };
    }

    return {
      allowed: true,
      remainingAttempts: result.remaining,
      ip: identifier,
    };
  } catch (error) {
    rateLimitLogger.error('Upstash rate limit check failed, falling back to in-memory', error);
    return recordLoginAttemptInMemory(identifier);
  }
}

/**
 * 메모리 기반 Rate Limiting (폴백)
 */
function recordLoginAttemptInMemory(identifier: string): RateLimitResult {
  const now = Date.now();
  const record = attempts.get(identifier);

  if (!record || now - record.lastAttempt > RESET_DURATION) {
    attempts.set(identifier, {
      count: 1,
      lastAttempt: now,
      failedUsernames: new Set(),
    });
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - 1,
      ip: identifier,
    };
  }

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingLockTime = Math.ceil((record.lockedUntil - now) / 1000 / 60);
    rateLimitLogger.warn(`Login blocked for IP ${identifier}, ${remainingLockTime} min remaining`);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: record.lockedUntil,
      ip: identifier,
    };
  }

  if (record.lockedUntil && now >= record.lockedUntil) {
    record.count = 0;
    record.failedUsernames = new Set();
    delete record.lockedUntil;
  }

  record.count++;
  record.lastAttempt = now;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION;
    attempts.set(identifier, record);
    rateLimitLogger.warn(
      `IP ${identifier} locked due to ${MAX_ATTEMPTS} failed attempts. Usernames tried: ${Array.from(record.failedUsernames).join(', ')}`
    );
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: record.lockedUntil,
      ip: identifier,
    };
  }

  attempts.set(identifier, record);
  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - record.count,
    ip: identifier,
  };
}

/**
 * 로그인 시도를 기록하고 제한을 확인합니다 (Request 기반)
 */
export async function recordLoginAttempt(request: Request): Promise<RateLimitResult> {
  const identifier = getClientIdentifier(request);
  return checkUpstashRateLimit(identifier);
}

/**
 * 로그인 시도를 기록하고 제한을 확인합니다 (Headers 기반)
 * Server Actions에서 사용할 수 있습니다
 */
export async function recordLoginAttemptFromHeaders(headers: Headers): Promise<RateLimitResult> {
  const identifier = getClientIPFromHeaders(headers);
  return checkUpstashRateLimit(identifier);
}

/**
 * 실패한 사용자명을 기록합니다 (공격 패턴 분석용)
 */
export function recordFailedUsername(ip: string, username: string): void {
  const record = attempts.get(ip);
  if (record) {
    record.failedUsernames.add(username);
    attempts.set(ip, record);
  }
}

/**
 * 성공한 로그인 시도 기록을 초기화합니다 (Request 기반)
 */
export async function resetLoginAttempts(request: Request): Promise<void> {
  const identifier = getClientIdentifier(request);
  await resetLoginAttemptsByIP(identifier);
}

/**
 * 성공한 로그인 시도 기록을 초기화합니다 (IP 기반)
 */
export async function resetLoginAttemptsByIP(ip: string): Promise<void> {
  // 메모리 기반 삭제
  attempts.delete(ip);

  // Upstash는 자동 만료되므로 별도 삭제 불필요
  // 단, 즉시 초기화가 필요한 경우 Redis에서 직접 삭제 가능
  if (redis) {
    try {
      await redis.del(`ratelimit:login:${ip}`);
    } catch (error) {
      rateLimitLogger.error('Failed to reset Upstash rate limit', error);
    }
  }
}

/**
 * Rate Limiting이 Upstash를 사용 중인지 확인
 */
export function isUsingUpstash(): boolean {
  return ratelimit !== null;
}

// ============================================================================
// 계정 복구 Rate Limiting
// ============================================================================

const ACCOUNT_RECOVERY_RATE_LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const ACCOUNT_RECOVERY_UNAVAILABLE_MESSAGE =
  '계정 복구 요청을 처리할 수 없습니다. 관리자에게 문의해주세요.';

function buildAccountRecoveryFingerprint(fields: string[]): string {
  const canonicalValue = fields.map((field) => field.trim().toLowerCase()).join('|');
  const secret = process.env.ACCOUNT_RECOVERY_RATE_LIMIT_SECRET;

  if (secret) {
    return createHmac('sha256', secret).update(canonicalValue).digest('hex');
  }

  return createHash('sha256').update(canonicalValue).digest('hex');
}

function getAccountRecoveryRatelimit(
  key: string,
  limit: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const cacheKey = `${key}:${limit}:${window}:${url}`;
  const cached = accountRecoveryRatelimits.get(cacheKey);
  if (cached) {
    return cached;
  }

  const accountRecoveryRedis = new Redis({ url, token });
  const limiter = new Ratelimit({
    redis: accountRecoveryRedis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix: `ratelimit:account-recovery:${key}`,
  });
  accountRecoveryRatelimits.set(cacheKey, limiter);

  return limiter;
}

function missingAccountRecoveryProductionConfig(): boolean {
  return (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN ||
    !process.env.ACCOUNT_RECOVERY_RATE_LIMIT_SECRET
  );
}

export async function checkAccountRecoveryRateLimit(
  request: Request,
  input: AccountRecoveryRateLimitInput
): Promise<AccountRecoveryRateLimitResult> {
  const ip = getClientIdentifier(request);
  const fingerprint = buildAccountRecoveryFingerprint([input.flow, ...input.fields]);

  if (process.env.NODE_ENV !== 'production') {
    return {
      allowed: true,
      remainingAttempts: Number.MAX_SAFE_INTEGER,
      ip,
      fingerprint,
    };
  }

  if (missingAccountRecoveryProductionConfig()) {
    rateLimitLogger.error('Account recovery rate limit production config is missing');
    return {
      allowed: false,
      remainingAttempts: 0,
      ip,
      fingerprint,
      status: 503,
      message: ACCOUNT_RECOVERY_UNAVAILABLE_MESSAGE,
    };
  }

  const ipRatelimit = getAccountRecoveryRatelimit('ip', 5, '15 m');
  const fingerprintRatelimit = getAccountRecoveryRatelimit('fingerprint', 3, '1 h');

  if (!ipRatelimit || !fingerprintRatelimit) {
    rateLimitLogger.error('Account recovery rate limit initialization failed');
    return {
      allowed: false,
      remainingAttempts: 0,
      ip,
      fingerprint,
      status: 503,
      message: ACCOUNT_RECOVERY_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const [ipResult, fingerprintResult] = await Promise.all([
      ipRatelimit.limit(`${input.flow}:ip:${ip}`),
      fingerprintRatelimit.limit(`${input.flow}:fingerprint:${fingerprint}`),
    ]);

    if (!ipResult.success || !fingerprintResult.success) {
      rateLimitLogger.warn('Account recovery rate limit exceeded', {
        flow: input.flow,
        ip,
        fingerprint,
      });
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: Math.max(ipResult.reset, fingerprintResult.reset),
        ip,
        fingerprint,
        status: 429,
        message: ACCOUNT_RECOVERY_RATE_LIMIT_MESSAGE,
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.min(ipResult.remaining, fingerprintResult.remaining),
      ip,
      fingerprint,
    };
  } catch (error) {
    rateLimitLogger.error('Account recovery rate limit check failed', error);
    return {
      allowed: false,
      remainingAttempts: 0,
      ip,
      fingerprint,
      status: 503,
      message: ACCOUNT_RECOVERY_UNAVAILABLE_MESSAGE,
    };
  }
}

// ============================================================================
// 웹하드 API Rate Limiting
// ============================================================================

const WEBHARD_MAX_ATTEMPTS = 100; // 분당 최대 요청 수
const WEBHARD_LOCKOUT_DURATION = 60 * 1000; // 1분

// 메모리 기반 웹하드 Rate Limiting (폴백)
const webhardAttempts = new Map<string, { count: number; timestamp: number }>();

/**
 * 메모리 기반 웹하드 Rate Limiting (폴백)
 */
function checkWebhardRateLimitInMemory(identifier: string): RateLimitResult {
  const now = Date.now();
  const record = webhardAttempts.get(identifier);

  // 1분이 지났으면 리셋
  if (!record || now - record.timestamp > WEBHARD_LOCKOUT_DURATION) {
    webhardAttempts.set(identifier, { count: 1, timestamp: now });
    return {
      allowed: true,
      remainingAttempts: WEBHARD_MAX_ATTEMPTS - 1,
      ip: identifier,
    };
  }

  // 제한 초과
  if (record.count >= WEBHARD_MAX_ATTEMPTS) {
    rateLimitLogger.warn(`Webhard rate limit exceeded for IP ${identifier}`);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: record.timestamp + WEBHARD_LOCKOUT_DURATION,
      ip: identifier,
    };
  }

  // 카운트 증가
  record.count++;
  webhardAttempts.set(identifier, record);

  return {
    allowed: true,
    remainingAttempts: WEBHARD_MAX_ATTEMPTS - record.count,
    ip: identifier,
  };
}

/**
 * 웹하드 API Rate Limiting 체크
 * API Key 요청은 rate limit 면제 (서버 간 동기화 통신)
 * @param request Request 객체 또는 Headers 객체
 * @returns RateLimitResult
 */
export async function checkWebhardRateLimit(request: Request | Headers): Promise<RateLimitResult> {
  // API Key 요청은 rate limit 면제 (동기화 프로그램 → NestJS 직접 호출 시)
  const headers = request instanceof Headers ? request : request.headers;
  const apiKey = headers instanceof Headers ? headers.get('x-api-key') : null;
  if (apiKey) {
    return { allowed: true, remainingAttempts: 999, ip: 'api-key' };
  }

  const identifier =
    request instanceof Headers ? getClientIPFromHeaders(request) : getClientIdentifier(request);

  if (process.env.NODE_ENV !== 'production') {
    return {
      allowed: true,
      remainingAttempts: Number.MAX_SAFE_INTEGER,
      ip: identifier,
    };
  }

  // Upstash가 설정된 경우
  if (webhardRatelimit) {
    try {
      const result = await webhardRatelimit.limit(identifier);

      if (!result.success) {
        rateLimitLogger.warn(`Webhard rate limit exceeded for IP ${identifier}`);
        return {
          allowed: false,
          remainingAttempts: 0,
          lockedUntil: result.reset,
          ip: identifier,
        };
      }

      return {
        allowed: true,
        remainingAttempts: result.remaining,
        ip: identifier,
      };
    } catch (error) {
      rateLimitLogger.error(
        'Upstash webhard rate limit check failed, falling back to in-memory',
        error
      );
      return checkWebhardRateLimitInMemory(identifier);
    }
  }

  // 폴백: 메모리 기반
  return checkWebhardRateLimitInMemory(identifier);
}

/**
 * 웹하드 Rate Limiting이 Upstash를 사용 중인지 확인
 */
export function isWebhardUsingUpstash(): boolean {
  return webhardRatelimit !== null;
}
