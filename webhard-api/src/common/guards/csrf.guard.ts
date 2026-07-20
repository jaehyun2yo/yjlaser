import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { CSRF_EXEMPT_METADATA_KEY } from '../decorators/csrf-exempt.decorator';
import { formatLogEvent, generateCorrelationId } from '../logging/log-event';

/**
 * CSRF 검증을 건너뛸 경로 목록.
 * 로그인 엔드포인트는 세션이 없는 상태에서 호출되므로 CSRF 토큰이 존재하지 않음.
 */
const CSRF_EXEMPT_PATHS = ['/api/v1/erp/workers/pin-login'];
const LOG_INGESTION_PATH = '/api/v1/integration/log-events';

/**
 * Double Submit Cookie 패턴 기반 CSRF 보호 Guard.
 *
 * 스킵 조건:
 * - GET / HEAD / OPTIONS 요청
 * - X-API-Key 또는 X-Account-Recovery-Key 헤더가 있는 요청 (서버 간 클라이언트)
 * - CSRF_EXEMPT_PATHS에 포함된 경로 (세션 없이 호출되는 로그인 등)
 *
 * 검증:
 * - 쿠키의 `csrf-token` vs 헤더의 `x-csrf-token`을 timing-safe compare로 비교
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  public constructor(private readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | string[] | undefined>;
      cookies?: Record<string, string>;
      path?: string;
      originalUrl?: string;
      url?: string;
    }>();

    // GET / HEAD / OPTIONS는 상태를 변경하지 않으므로 스킵
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    if (this.isCsrfExempt(context)) {
      return true;
    }

    // 서버 간 인증 요청은 CSRF 검증 불필요
    if (request.headers['x-api-key'] || request.headers['x-account-recovery-key']) {
      return true;
    }

    // 세션 없이 호출되는 엔드포인트는 CSRF 검증 불가 — 스킵
    const requestPath = (request.path ?? request.originalUrl ?? request.url ?? '').split('?')[0];
    if (CSRF_EXEMPT_PATHS.some((exempt) => requestPath.endsWith(exempt))) {
      return true;
    }

    if (isLogIngestionRequest(requestPath, request.method)) {
      return true;
    }

    const cookieToken = request.cookies?.['csrf-token'];
    const headerToken = request.headers['x-csrf-token'];

    if (!cookieToken || !headerToken) {
      this.logCsrfFailure(
        request.method,
        requestPath,
        getMissingTokenReason(cookieToken, headerToken)
      );
      throw new ForbiddenException('CSRF token missing');
    }

    const headerTokenStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;

    // timing-safe compare로 토큰 비교 (타이밍 공격 방지)
    if (!timingSafeEqual(cookieToken, headerTokenStr)) {
      this.logCsrfFailure(request.method, requestPath, 'token_mismatch');
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }

  private logCsrfFailure(method: string, path: string, reason: string): void {
    this.logger.warn(
      formatLogEvent({
        level: 'warn',
        project: 'company_site',
        component: CsrfGuard.name,
        feature: 'auth',
        event: 'csrf_rejected',
        action: 'validate_csrf',
        status: 'failure',
        channel: 'security',
        correlation_id: generateCorrelationId('auth'),
        metadata: {
          reason,
          method,
          path,
        },
      })
    );
  }

  private isCsrfExempt(context: ExecutionContext): boolean {
    if (
      !this.reflector ||
      typeof context.getHandler !== 'function' ||
      typeof context.getClass !== 'function'
    ) {
      return false;
    }

    return (
      this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

function getMissingTokenReason(
  cookieToken: string | undefined,
  headerToken: string | string[] | undefined
): string {
  if (!cookieToken && !headerToken) {
    return 'missing_cookie_and_header_token';
  }
  if (!cookieToken) {
    return 'missing_cookie_token';
  }
  return 'missing_header_token';
}

function isLogIngestionRequest(requestPath: string, method: string): boolean {
  return method === 'POST' && requestPath === LOG_INGESTION_PATH;
}

/**
 * 문자열 기반 timing-safe 비교.
 * 길이가 다르면 즉시 false (단, 길이 자체를 노출하지 않도록 crypto.timingSafeEqual 사용).
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // 길이가 다를 때도 고정 시간 비교를 유지하기 위해 더미 비교 수행
    const dummy = Buffer.alloc(bufA.length);
    crypto.timingSafeEqual(bufA, dummy);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
