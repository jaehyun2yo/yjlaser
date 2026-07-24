import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { DeviceBearerRequestSourceGuard } from '../device-auth/device-bearer-request-source.guard';
import { DeviceBearerGuard } from '../device-auth/device-bearer.guard';
import {
  ApiKeyGuard,
  inspectRawIntegrationPrincipalSources,
  type PrincipalMode,
} from './api-key.guard';

type IntegrationPrincipalRequest = Request & {
  readonly user?: { readonly userType?: unknown };
  readonly apiKeyInfo?: unknown;
  readonly deviceAuthInfo?: unknown;
};

const INTEGRATION_PRINCIPAL_MODES = new WeakMap<Request, PrincipalMode>();

export function getIntegrationPrincipalMode(request: Request): PrincipalMode | undefined {
  return INTEGRATION_PRINCIPAL_MODES.get(request);
}

@Injectable()
export class IntegrationPrincipalSourceGuard implements CanActivate {
  public constructor(
    private readonly deviceBearerRequestSourceGuard: DeviceBearerRequestSourceGuard,
    private readonly deviceBearerGuard: DeviceBearerGuard,
    private readonly apiKeyGuard: ApiKeyGuard
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IntegrationPrincipalRequest>();
    INTEGRATION_PRINCIPAL_MODES.delete(request);
    if (
      request.user !== undefined ||
      request.apiKeyInfo !== undefined ||
      request.deviceAuthInfo !== undefined
    ) {
      throw ambiguousPrincipal();
    }

    const rawSources = inspectRawIntegrationPrincipalSources(request);
    if (rawSources.ambiguous) throw ambiguousPrincipal();
    const mode = rawSources.modes[0];

    if (mode === 'device_bearer') {
      await this.deviceBearerRequestSourceGuard.canActivate(context);
      const allowed = await this.deviceBearerGuard.canActivate(context);
      if (
        !allowed ||
        request.deviceAuthInfo === undefined ||
        request.user !== undefined ||
        request.apiKeyInfo !== undefined
      ) {
        throw ambiguousPrincipal();
      }
      INTEGRATION_PRINCIPAL_MODES.set(request, mode);
      return true;
    }

    const allowed = await this.apiKeyGuard.canActivateStrict(context);
    if (!allowed || !hasExactPostcondition(request, mode)) throw ambiguousPrincipal();
    INTEGRATION_PRINCIPAL_MODES.set(request, mode);
    return true;
  }
}

function hasExactPostcondition(
  request: IntegrationPrincipalRequest,
  mode: PrincipalMode | undefined
): mode is Exclude<PrincipalMode, 'device_bearer'> {
  if (request.deviceAuthInfo !== undefined || !request.user) return false;
  if (mode === 'legacy_api_key') {
    return request.user.userType === 'integration' && request.apiKeyInfo !== undefined;
  }
  if (request.apiKeyInfo !== undefined) return false;
  if (mode === 'admin_session') return request.user.userType === 'admin';
  if (mode === 'company_session') return request.user.userType === 'company';
  if (mode === 'worker_session') return request.user.userType === 'worker';
  return false;
}

function ambiguousPrincipal(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INTEGRATION_PRINCIPAL_AMBIGUOUS',
    message: 'Exactly one integration principal source is required',
  });
}
