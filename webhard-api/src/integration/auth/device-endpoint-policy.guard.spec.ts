import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DeviceBearerRequestSourceGuard } from '../device-auth/device-bearer-request-source.guard';
import { DeviceBearerGuard } from '../device-auth/device-bearer.guard';
import { ApiKeyGuard, type PrincipalMode } from './api-key.guard';
import { DeviceEndpointPolicyGuard } from './device-endpoint-policy.guard';
import { DEVICE_ENDPOINT_POLICY_KEY } from './require-device-endpoint-policy.decorator';
import { IntegrationPrincipalSourceGuard } from './integration-principal-source.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function guardFor(requirement?: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  pathTemplate: string;
}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === DEVICE_ENDPOINT_POLICY_KEY ? requirement : undefined
    ),
  } as unknown as Reflector;
  return new DeviceEndpointPolicyGuard(reflector);
}

async function authenticate(
  mode: PrincipalMode,
  request: Record<string, unknown>,
  deviceAuthInfo?: Record<string, unknown>
): Promise<void> {
  const rawSource =
    mode === 'device_bearer'
      ? {
          headers: { authorization: 'Bearer synthetic.jwt.token' },
          rawHeaders: ['Authorization', 'Bearer synthetic.jwt.token'],
          cookies: {},
        }
      : mode === 'legacy_api_key'
        ? {
            headers: { 'x-api-key': 'legacy' },
            rawHeaders: ['X-API-Key', 'legacy'],
            cookies: {},
          }
        : mode === 'admin_session'
          ? { headers: {}, cookies: { 'admin-session': 'admin' } }
          : mode === 'company_session'
            ? { headers: {}, cookies: { 'company-session': 'company' } }
            : { headers: {}, cookies: { 'erp-session': 'worker' } };
  Object.assign(request, rawSource);

  const guard = new IntegrationPrincipalSourceGuard(
    { canActivate: jest.fn().mockReturnValue(true) } as unknown as DeviceBearerRequestSourceGuard,
    {
      canActivate: jest.fn(async (context: ExecutionContext) => {
        context.switchToHttp().getRequest<Record<string, unknown>>().deviceAuthInfo =
          deviceAuthInfo;
        return true;
      }),
    } as unknown as DeviceBearerGuard,
    {
      canActivateStrict: jest.fn(async (context: ExecutionContext) => {
        const target = context.switchToHttp().getRequest<Record<string, unknown>>();
        const userType = mode.replace('_session', '');
        target.user = { userType: mode === 'legacy_api_key' ? 'integration' : userType };
        if (mode === 'legacy_api_key') target.apiKeyInfo = { id: 'legacy' };
        return true;
      }),
    } as unknown as ApiKeyGuard
  );
  await guard.canActivate(contextFor(request));
}

describe('DeviceEndpointPolicyGuard', () => {
  it('allows only the exact approved program and server-derived permission', async () => {
    const guard = guardFor({ method: 'PATCH', pathTemplate: '/files/:id/move' });
    const request = {
      method: 'PATCH',
    };
    await authenticate('device_bearer', request, {
      programType: 'external_webhard_sync',
      capabilityProfile: 'standard',
      permissions: ['file/move'],
    });
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it.each(['legacy_api_key', 'admin_session', 'company_session', 'worker_session'] as const)(
    'passes through a composite-authenticated %s principal without device policy metadata',
    async (mode) => {
      const request = { method: 'GET' };
      await authenticate(mode, request);

      expect(guardFor().canActivate(contextFor(request))).toBe(true);
    }
  );

  it.each([
    [
      {
        programType: 'external_webhard_sync',
        capabilityProfile: 'safe_canary',
        permissions: [],
      },
      'DEVICE_PRINCIPAL_NOT_ALLOWED',
      'PATCH',
    ],
    [
      {
        programType: 'external_webhard_sync',
        capabilityProfile: 'standard',
        permissions: ['file/read'],
      },
      'INTEGRATION_PERMISSION_DENIED',
      'PATCH',
    ],
    [
      {
        programType: 'external_webhard_sync',
        capabilityProfile: 'standard',
        permissions: ['file/move'],
      },
      'DEVICE_PRINCIPAL_NOT_ALLOWED',
      'POST',
    ],
    [
      {
        programType: 'management_program',
        capabilityProfile: 'standard',
        permissions: ['file/move'],
      },
      'DEVICE_PRINCIPAL_NOT_ALLOWED',
      'PATCH',
    ],
  ])(
    'fails closed with the public contract for held, wrong, or safe-canary device principal %#',
    async (deviceAuthInfo, code, method) => {
      const guard = guardFor({ method: 'PATCH', pathTemplate: '/files/:id/move' });
      const request = { method };
      await authenticate('device_bearer', request, deviceAuthInfo as Record<string, unknown>);
      expect(() => guard.canActivate(contextFor(request))).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code }) })
      );
    }
  );

  it('default-denies a device route without immutable policy metadata', async () => {
    const guard = guardFor();
    const request = { method: 'GET' };
    await authenticate('device_bearer', request, {
      programType: 'external_webhard_sync',
      capabilityProfile: 'standard',
      permissions: ['folder/read'],
    });
    expect(() => guard.canActivate(contextFor(request))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'DEVICE_PRINCIPAL_NOT_ALLOWED' }),
      })
    );
  });

  it.each([
    { method: 'PATCH' },
    { method: 'PATCH', user: { userType: 'admin' } },
    {
      method: 'PATCH',
      user: { userType: 'integration' },
      apiKeyInfo: { id: 'forged' },
    },
  ])('denies an untrusted or forged ambient principal %#', (request) => {
    const guard = guardFor({ method: 'PATCH', pathTemplate: '/files/:id/move' });
    expect(() => guard.canActivate(contextFor(request))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'DEVICE_PRINCIPAL_NOT_ALLOWED' }),
      })
    );
  });
});
