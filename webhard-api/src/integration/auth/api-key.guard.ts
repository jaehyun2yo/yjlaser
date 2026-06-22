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
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_WORKER_SESSION_KEY } from './allow-worker-session.decorator';
import { INTEGRATION_PERMISSION_KEY } from './require-integration-permission.decorator';
import type { IntegrationPermission } from './integration-permissions';

const API_KEY_HEADER = 'x-api-key';
const SESSION_COOKIE_NAMES = ['admin-session', 'company-session'] as const;
const WORKER_SESSION_COOKIE_NAME = 'erp-session';
const INTEGRATION_AUTH_REQUIRED_CODE = 'INTEGRATION_AUTH_REQUIRED';
const INTEGRATION_PERMISSION_DENIED_CODE = 'INTEGRATION_PERMISSION_DENIED';

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
    const apiKey = request.headers[API_KEY_HEADER] as string;
    if (apiKey) {
      const keyInfo = await this.apiKeyService.validateKey(apiKey);
      if (keyInfo) {
        if (
          requiredIntegrationPermission &&
          !keyInfo.permissions.includes(requiredIntegrationPermission)
        ) {
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
    }

    throw new UnauthorizedException({
      code: INTEGRATION_AUTH_REQUIRED_CODE,
      message: 'Valid session or API key required',
    });
  }
}
