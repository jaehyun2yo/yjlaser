import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { AuthService, SessionUser } from '../../auth/auth.service';
import {
  formatLogEvent,
  generateCorrelationId,
  hashIdentifier,
} from '../../common/logging/log-event';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_WORKER_SESSION_KEY } from './allow-worker-session.decorator';
import { INTEGRATION_PERMISSION_KEY } from './require-integration-permission.decorator';
import { hasIntegrationPermission, type IntegrationPermission } from './integration-permissions';

const API_KEY_HEADER = 'x-api-key';
const SESSION_COOKIE_NAMES = ['admin-session', 'company-session'] as const;
const WORKER_SESSION_COOKIE_NAME = 'erp-session';
const INTEGRATION_AUTH_REQUIRED_CODE = 'INTEGRATION_AUTH_REQUIRED';
const INTEGRATION_PERMISSION_DENIED_CODE = 'INTEGRATION_PERMISSION_DENIED';
const INTEGRATION_PRINCIPAL_AMBIGUOUS_CODE = 'INTEGRATION_PRINCIPAL_AMBIGUOUS';

export type PrincipalMode =
  | 'device_bearer'
  | 'legacy_api_key'
  | 'admin_session'
  | 'company_session'
  | 'worker_session';

export interface RawIntegrationPrincipalSources {
  readonly modes: readonly PrincipalMode[];
  readonly ambiguous: boolean;
}

type SecurityLogInput = {
  event: string;
  action: string;
  reason: string;
  actorType?: string;
  actorIdHash?: string;
  metadata?: Record<string, unknown>;
};

/**
 * 통합 인증 가드: Session 쿠키 또는 API Key 헤더 중 하나로 인증
 * - 웹 대시보드: 기존 세션 쿠키 인증
 * - 데스크톱 프로그램: X-API-Key 헤더 인증
 * - @Public() 데코레이터가 적용된 라우트는 인증 생략
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private reflector: Reflector,
    private apiKeyService: ApiKeyService,
    private authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    return this.authenticate(context, true);
  }

  public async canActivateStrict(context: ExecutionContext): Promise<boolean> {
    return this.authenticate(context, false);
  }

  private async authenticate(
    context: ExecutionContext,
    allowPublicBypass: boolean
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawSources = inspectRawIntegrationPrincipalSources(request);
    if (rawSources.ambiguous) {
      throw new UnauthorizedException({
        code: INTEGRATION_PRINCIPAL_AMBIGUOUS_CODE,
        message: 'Exactly one integration principal source is required',
      });
    }

    // @Public() 데코레이터가 적용된 라우트는 인증 생략
    if (allowPublicBypass) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }
    }

    const allowWorkerSession = this.reflector.getAllAndOverride<boolean>(ALLOW_WORKER_SESSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredIntegrationPermission = this.reflector.getAllAndOverride<IntegrationPermission>(
      INTEGRATION_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    // 1. 세션 쿠키 인증 시도 (admin-session, company-session 순서)
    for (const cookieName of SESSION_COOKIE_NAMES) {
      const sessionCookie = request.cookies?.[cookieName];
      if (sessionCookie) {
        const user = this.authService.verifySession(sessionCookie);
        if (user) {
          (request as Request & { user: SessionUser }).user = user;
          return true;
        }
      }
    }

    // 1-1. 명시적으로 허용된 worker-facing endpoint에서만 erp-session 인증 허용
    if (allowWorkerSession) {
      const workerSessionCookie = request.cookies?.[WORKER_SESSION_COOKIE_NAME];
      const worker = this.authService.verifyWorkerSession(workerSessionCookie);
      if (worker) {
        (request as Request & { user: SessionUser }).user = worker;
        return true;
      }
    }

    // 2. API Key 인증 시도
    let authFailureLogged = false;
    const apiKeyHeader = request.headers[API_KEY_HEADER];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    if (apiKey) {
      const keyInfo = await this.apiKeyService.validateKey(apiKey);
      if (keyInfo) {
        if (
          requiredIntegrationPermission &&
          !hasIntegrationPermission(keyInfo.permissions, requiredIntegrationPermission)
        ) {
          this.logSecurityFailure({
            event: 'api_key_permission_denied',
            action: 'authorize_integration_permission',
            reason: 'permission_denied',
            actorType: 'api_client',
            actorIdHash: hashIdentifier(keyInfo.id),
            metadata: {
              required_permission: requiredIntegrationPermission,
              program_type: keyInfo.programType,
            },
          });
          throw new ForbiddenException({
            code: INTEGRATION_PERMISSION_DENIED_CODE,
            message: 'Integration permission required',
            required_permission: requiredIntegrationPermission,
          });
        }

        // API Key 사용자는 admin session과 분리된 integration principal로 설정
        (request as Request & { user: SessionUser }).user = {
          userType: 'integration',
          userId: `api:${keyInfo.programType}`,
          companyId: null,
          programType: keyInfo.programType,
          permissions: keyInfo.permissions,
        };
        (request as Request & { apiKeyInfo: typeof keyInfo }).apiKeyInfo = keyInfo;
        return true;
      }

      this.logSecurityFailure({
        event: 'api_key_rejected',
        action: 'validate_api_key',
        reason: 'invalid_key',
        actorType: 'api_client',
        actorIdHash: hashIdentifier(apiKey),
      });
      authFailureLogged = true;
    }

    if (!authFailureLogged) {
      this.logSecurityFailure({
        event: 'integration_auth_rejected',
        action: 'authenticate_integration',
        reason: 'missing_credentials',
        actorType: 'anonymous',
      });
    }

    throw new UnauthorizedException({
      code: INTEGRATION_AUTH_REQUIRED_CODE,
      message: 'Valid session or API key required',
    });
  }

  private logSecurityFailure(input: SecurityLogInput): void {
    this.logger.warn(
      formatLogEvent({
        level: 'warn',
        project: 'company_site',
        component: ApiKeyGuard.name,
        feature: 'auth',
        event: input.event,
        action: input.action,
        status: 'failure',
        channel: 'security',
        correlation_id: generateCorrelationId('auth'),
        actor_type: input.actorType,
        actor_id_hash: input.actorIdHash,
        metadata: {
          reason: input.reason,
          ...(input.metadata ?? {}),
        },
      })
    );
  }
}

const AUTH_COOKIE_MODES: Readonly<Record<string, PrincipalMode>> = Object.freeze({
  'admin-session': 'admin_session',
  'company-session': 'company_session',
  'erp-session': 'worker_session',
  'worker-session': 'worker_session',
});

export function inspectRawIntegrationPrincipalSources(
  request: Request
): RawIntegrationPrincipalSources {
  const authorizationValues = getRawHeaderValues(request, 'authorization');
  const apiKeyValues = getRawHeaderValues(request, API_KEY_HEADER);
  const cookieHeaderValues = getRawHeaderValues(request, 'cookie');
  const modes: PrincipalMode[] = [];
  let malformed = false;

  if (authorizationValues.length > 0) {
    modes.push('device_bearer');
    malformed ||= hasDuplicateOrCombinedValues(authorizationValues);
  }
  if (apiKeyValues.length > 0) {
    modes.push('legacy_api_key');
    malformed ||= hasDuplicateOrCombinedValues(apiKeyValues);
  }

  const cookieModes =
    cookieHeaderValues.length > 0
      ? getAuthCookieModes(cookieHeaderValues)
      : getParsedCookieModes(request.cookies);
  modes.push(...cookieModes);
  malformed ||=
    cookieModes.length > 0 &&
    (cookieHeaderValues.length > 1 || cookieHeaderValues.some((value) => value.includes(',')));

  return Object.freeze({
    modes: Object.freeze([...modes]),
    ambiguous: malformed || modes.length > 1,
  });
}

function getRawHeaderValues(request: Request, name: string): string[] {
  const values: string[] = [];
  const rawHeaders = Array.isArray(request.rawHeaders) ? request.rawHeaders : [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name.toLowerCase()) {
      values.push(rawHeaders[index + 1] ?? '');
    }
  }
  if (values.length > 0) return values;

  const normalized = Object.entries(request.headers ?? {}).find(
    ([candidate]) => candidate.toLowerCase() === name.toLowerCase()
  )?.[1];
  if (Array.isArray(normalized)) return normalized;
  return typeof normalized === 'string' ? [normalized] : [];
}

function hasDuplicateOrCombinedValues(values: readonly string[]): boolean {
  return values.length !== 1 || values[0].includes(',');
}

function getAuthCookieModes(cookieHeaders: readonly string[]): PrincipalMode[] {
  const modes: PrincipalMode[] = [];
  for (const cookieHeader of cookieHeaders) {
    for (const part of cookieHeader.split(';')) {
      const separator = part.indexOf('=');
      const name = (separator < 0 ? part : part.slice(0, separator)).trim().toLowerCase();
      const mode = AUTH_COOKIE_MODES[name];
      if (mode) modes.push(mode);
    }
  }
  return modes;
}

function getParsedCookieModes(cookies: unknown): PrincipalMode[] {
  if (!cookies || typeof cookies !== 'object' || Array.isArray(cookies)) return [];
  return Object.keys(cookies as Record<string, unknown>)
    .map((name) => AUTH_COOKIE_MODES[name.toLowerCase()])
    .filter((mode): mode is PrincipalMode => mode !== undefined);
}
