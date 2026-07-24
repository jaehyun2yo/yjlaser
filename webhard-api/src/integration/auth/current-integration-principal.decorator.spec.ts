import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import {
  resolveCurrentIntegrationPrincipal,
  type CurrentIntegrationPrincipalValue,
} from './current-integration-principal.decorator';
import { DeviceBearerRequestSourceGuard } from '../device-auth/device-bearer-request-source.guard';
import { DeviceBearerGuard } from '../device-auth/device-bearer.guard';
import { ApiKeyGuard } from './api-key.guard';
import { IntegrationPrincipalSourceGuard } from './integration-principal-source.guard';

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

async function authenticateDevice(request: Record<string, unknown>): Promise<void> {
  Object.assign(request, {
    headers: { authorization: 'Bearer synthetic.jwt.token' },
    rawHeaders: ['Authorization', 'Bearer synthetic.jwt.token'],
    cookies: {},
  });
  const principal = {
    deviceId: 'device-1',
    environment: 'prd' as const,
    programType: 'external_webhard_sync' as const,
    capabilityProfile: 'standard' as const,
    permissions: ['file/read'] as const,
    credentialVersion: 7,
  };
  const guard = new IntegrationPrincipalSourceGuard(
    { canActivate: jest.fn().mockReturnValue(true) } as unknown as DeviceBearerRequestSourceGuard,
    {
      canActivate: jest.fn((context) => {
        context.switchToHttp().getRequest().deviceAuthInfo = principal;
        return true;
      }),
    } as unknown as DeviceBearerGuard,
    { canActivateStrict: jest.fn() } as unknown as ApiKeyGuard
  );
  await guard.canActivate(contextFor(request));
}

describe('CurrentIntegrationPrincipal', () => {
  it('returns a device-discriminated principal without synthesizing request.user', async () => {
    const request: Record<string, unknown> = {};
    await authenticateDevice(request);

    const result: CurrentIntegrationPrincipalValue = resolveCurrentIntegrationPrincipal(
      request as unknown as Request
    );

    expect(result).toMatchObject({
      mode: 'device_bearer',
      device: { deviceId: 'device-1', programType: 'external_webhard_sync' },
    });
    expect(request.user).toBeUndefined();
  });

  it('rejects ambient session state that was not authenticated by the composite source guard', () => {
    const user = { userType: 'admin' as const, userId: 'admin', companyId: 0 };
    const request = {
      headers: {},
      rawHeaders: [],
      cookies: { 'admin-session': 'session' },
      user,
    };

    expect(() => resolveCurrentIntegrationPrincipal(request as unknown as Request)).toThrow(
      UnauthorizedException
    );
  });
});
