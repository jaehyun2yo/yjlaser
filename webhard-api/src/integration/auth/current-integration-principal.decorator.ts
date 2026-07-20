import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '../../auth/auth.service';
import type { DeviceAccessPrincipal } from '../device-auth/device-auth.types';
import { getIntegrationPrincipalMode } from './integration-principal-source.guard';
import type { PrincipalMode } from './api-key.guard';

type PrincipalRequest = Request & {
  readonly user?: SessionUser;
  readonly deviceAuthInfo?: DeviceAccessPrincipal;
};

export type CurrentIntegrationPrincipalValue =
  | {
      readonly mode: 'device_bearer';
      readonly device: DeviceAccessPrincipal;
    }
  | {
      readonly mode: Exclude<PrincipalMode, 'device_bearer'>;
      readonly user: SessionUser;
    };

export function resolveCurrentIntegrationPrincipal(
  request: Request
): CurrentIntegrationPrincipalValue {
  const principalRequest = request as PrincipalRequest;
  const mode = getIntegrationPrincipalMode(request);
  if (mode === 'device_bearer' && principalRequest.deviceAuthInfo && !principalRequest.user) {
    return { mode, device: principalRequest.deviceAuthInfo };
  }
  if (
    mode &&
    mode !== 'device_bearer' &&
    principalRequest.user &&
    !principalRequest.deviceAuthInfo
  ) {
    return { mode, user: principalRequest.user };
  }
  throw new UnauthorizedException({
    code: 'INTEGRATION_PRINCIPAL_AMBIGUOUS',
    message: 'Exactly one integration principal source is required',
  });
}

export const CurrentIntegrationPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentIntegrationPrincipalValue =>
    resolveCurrentIntegrationPrincipal(context.switchToHttp().getRequest<Request>())
);
