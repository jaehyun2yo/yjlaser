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
    // @Public() 데코레이터가 적용된 라우트는 인증 생략
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
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
