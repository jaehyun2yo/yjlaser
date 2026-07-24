import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionUser } from '../auth.service';
import { ALLOW_INTEGRATION_PRINCIPAL_KEY } from '../../integration/auth/allow-integration-principal.decorator';
import { getIntegrationPrincipalMode } from '../../integration/auth/integration-principal-source.guard';

/**
 * Guard to check if user has access to a specific company's resources
 *
 * 접근 제어 원칙:
 *   - admin: 모든 리소스 접근 가능
 *   - company: 자기 회사(companyId === user.companyId)만 접근 가능
 *   - companyId=null/0 (공유 리소스): company 사용자 접근 차단
 *
 * 서비스 레이어에서도 반드시 companyId 필터링 필요 (이중 방어)
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  private readonly logger = new Logger(CompanyAccessGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: SessionUser; deviceAuthInfo?: unknown }>();
    const user = request.user;

    if (
      getIntegrationPrincipalMode(request) === 'device_bearer' &&
      request.deviceAuthInfo !== undefined &&
      user === undefined
    ) {
      return true;
    }

    if (!user) {
      throw new ForbiddenException('No user found in request');
    }

    // Admin users have access to all companies
    if (user.userType === 'admin') {
      return true;
    }

    if (user.userType === 'integration') {
      if (this.isIntegrationPrincipalAllowed(context)) {
        return true;
      }

      this.logger.warn('Integration principal denied on company-scoped resource', {
        userId: user.userId,
        programType: user.programType,
      });
      throw new ForbiddenException('Integration principal requires an explicit scoped endpoint');
    }

    // For company users, check if they're trying to access their own company
    const targetCompanyId = this.getTargetCompanyId(request);

    // No specific company targeted — service layer must filter by user.companyId
    if (targetCompanyId === null) {
      return true;
    }

    // Company user trying to access companyId=0 (shared) — block
    if (targetCompanyId === 0) {
      throw new ForbiddenException('Access denied to shared resources');
    }

    // Check if user is accessing their own company
    if (user.companyId === targetCompanyId) {
      return true;
    }

    this.logger.warn('Company access denied', {
      userCompanyId: user.companyId,
      targetCompanyId,
      userType: user.userType,
    });

    throw new ForbiddenException('Access denied to this company resources');
  }

  private getTargetCompanyId(request: Request): number | null {
    // Check query params
    const companyIdParam = request.query.companyId;
    if (companyIdParam) {
      return Number(companyIdParam);
    }

    // Check body
    const companyIdBody = request.body?.companyId;
    if (companyIdBody !== undefined) {
      return Number(companyIdBody);
    }

    // Check route params
    const companyIdRoute = request.params?.companyId;
    if (companyIdRoute) {
      return Number(companyIdRoute);
    }

    return null;
  }

  private isIntegrationPrincipalAllowed(context: ExecutionContext): boolean {
    return (
      Reflect.getMetadata(ALLOW_INTEGRATION_PRINCIPAL_KEY, context.getHandler()) === true ||
      Reflect.getMetadata(ALLOW_INTEGRATION_PRINCIPAL_KEY, context.getClass()) === true
    );
  }
}
