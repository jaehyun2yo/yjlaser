import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DeviceBearerRequestSourceGuard } from '../device-auth/device-bearer-request-source.guard';
import { DeviceBearerGuard } from '../device-auth/device-bearer.guard';
import { ApiKeyGuard, type PrincipalMode } from './api-key.guard';
import {
  getIntegrationPrincipalMode,
  IntegrationPrincipalSourceGuard,
} from './integration-principal-source.guard';

function contextFor(request: Record<PropertyKey, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeGuard() {
  const sourceGuard = { canActivate: jest.fn().mockReturnValue(true) };
  const deviceGuard = {
    canActivate: jest.fn(async (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<Record<string, unknown>>();
      request.deviceAuthInfo = Object.freeze({ programType: 'external_webhard_sync' });
      return true;
    }),
  };
  const apiKeyGuard = {
    canActivateStrict: jest.fn(async (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<Record<string, unknown>>();
      request.user = request.expectedUser;
      if (request.expectedApiKeyInfo !== undefined) {
        request.apiKeyInfo = request.expectedApiKeyInfo;
      }
      return true;
    }),
  };
  return {
    guard: new IntegrationPrincipalSourceGuard(
      sourceGuard as unknown as DeviceBearerRequestSourceGuard,
      deviceGuard as unknown as DeviceBearerGuard,
      apiKeyGuard as unknown as ApiKeyGuard
    ),
    sourceGuard,
    deviceGuard,
    apiKeyGuard,
  };
}

describe('IntegrationPrincipalSourceGuard', () => {
  it('routes an exclusive Bearer source only through device authentication', async () => {
    const { guard, sourceGuard, deviceGuard, apiKeyGuard } = makeGuard();
    const request: Record<PropertyKey, unknown> = {
      headers: { authorization: 'Bearer synthetic.jwt.token' },
      rawHeaders: ['Authorization', 'Bearer synthetic.jwt.token'],
      cookies: {},
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(sourceGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(deviceGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(apiKeyGuard.canActivateStrict).not.toHaveBeenCalled();
    expect(request.deviceAuthInfo).toEqual({ programType: 'external_webhard_sync' });
    expect(request.user).toBeUndefined();
    expect(request.apiKeyInfo).toBeUndefined();
    expect(getIntegrationPrincipalMode(request as never)).toBe('device_bearer');
  });

  it.each([
    [
      'legacy_api_key',
      'integration',
      { headers: { 'x-api-key': 'legacy' }, rawHeaders: ['X-API-Key', 'legacy'] },
    ],
    ['admin_session', 'admin', { cookies: { 'admin-session': 'admin' } }],
    ['company_session', 'company', { cookies: { 'company-session': 'company' } }],
    ['worker_session', 'worker', { cookies: { 'erp-session': 'worker' } }],
  ])('preserves the existing %s actor from ApiKeyGuard', async (mode, userType, source) => {
    const { guard, sourceGuard, deviceGuard, apiKeyGuard } = makeGuard();
    const expectedUser = { userType };
    const expectedApiKeyInfo = mode === 'legacy_api_key' ? { id: 'legacy' } : undefined;
    const request = { headers: {}, cookies: {}, expectedUser, expectedApiKeyInfo, ...source };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(apiKeyGuard.canActivateStrict).toHaveBeenCalledTimes(1);
    expect(sourceGuard.canActivate).not.toHaveBeenCalled();
    expect(deviceGuard.canActivate).not.toHaveBeenCalled();
    expect((request as { user?: unknown }).user).toBe(expectedUser);
    expect((request as { deviceAuthInfo?: unknown }).deviceAuthInfo).toBeUndefined();
    expect(getIntegrationPrincipalMode(request as never)).toBe(mode as PrincipalMode);
  });

  it.each([
    {
      headers: { authorization: 'Bearer token', 'x-api-key': 'legacy' },
      rawHeaders: ['Authorization', 'Bearer token', 'X-API-Key', 'legacy'],
      cookies: {},
    },
    { headers: {}, cookies: { 'admin-session': 'admin', 'company-session': 'company' } },
    { headers: { 'x-api-key': 'legacy' }, cookies: { 'erp-session': 'worker' } },
    {
      headers: { cookie: 'admin-session=first; admin-session=second' },
      rawHeaders: ['Cookie', 'admin-session=first; admin-session=second'],
      cookies: { 'admin-session': 'second' },
    },
    {
      headers: { cookie: 'admin-session=first, company-session=second' },
      rawHeaders: ['Cookie', 'admin-session=first, company-session=second'],
      cookies: { 'admin-session': 'first, company-session=second' },
    },
  ])(
    'fails closed before invoking any principal guard for ambiguous source %#',
    async (request) => {
      const { guard, sourceGuard, deviceGuard, apiKeyGuard } = makeGuard();

      await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(sourceGuard.canActivate).not.toHaveBeenCalled();
      expect(deviceGuard.canActivate).not.toHaveBeenCalled();
      expect(apiKeyGuard.canActivateStrict).not.toHaveBeenCalled();
      expect((request as { user?: unknown }).user).toBeUndefined();
      expect((request as { deviceAuthInfo?: unknown }).deviceAuthInfo).toBeUndefined();
      expect((request as { apiKeyInfo?: unknown }).apiKeyInfo).toBeUndefined();
    }
  );

  it.each([
    [{ headers: {}, cookies: {} }, undefined],
    [
      { headers: { 'x-api-key': 'invalid' }, rawHeaders: ['X-API-Key', 'invalid'], cookies: {} },
      'legacy_api_key',
    ],
    [{ headers: {}, cookies: { 'admin-session': 'invalid' } }, 'admin_session'],
  ])(
    'rejects @Public zero or invalid credentials without recording trust %#',
    async (source, _mode) => {
      const sourceGuard = { canActivate: jest.fn() };
      const deviceGuard = { canActivate: jest.fn() };
      const apiKeyGuard = {
        canActivateStrict: jest
          .fn()
          .mockRejectedValue(new UnauthorizedException({ code: 'INTEGRATION_AUTH_REQUIRED' })),
      };
      const guard = new IntegrationPrincipalSourceGuard(
        sourceGuard as unknown as DeviceBearerRequestSourceGuard,
        deviceGuard as unknown as DeviceBearerGuard,
        apiKeyGuard as unknown as ApiKeyGuard
      );
      const request = { ...source };

      await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(apiKeyGuard.canActivateStrict).toHaveBeenCalledTimes(1);
      expect(getIntegrationPrincipalMode(request as never)).toBeUndefined();
    }
  );

  it.each([
    { headers: {}, cookies: {}, user: { userType: 'admin' } },
    {
      headers: { 'x-api-key': 'forged' },
      rawHeaders: ['X-API-Key', 'forged'],
      cookies: {},
      user: { userType: 'integration' },
      apiKeyInfo: { id: 'forged' },
    },
  ])('rejects ambient principal state before delegation %#', async (request) => {
    const { guard, sourceGuard, deviceGuard, apiKeyGuard } = makeGuard();

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(sourceGuard.canActivate).not.toHaveBeenCalled();
    expect(deviceGuard.canActivate).not.toHaveBeenCalled();
    expect(apiKeyGuard.canActivateStrict).not.toHaveBeenCalled();
    expect(getIntegrationPrincipalMode(request as never)).toBeUndefined();
  });

  it.each([
    ['legacy_api_key', { userType: 'admin' }, { id: 'legacy' }],
    ['admin_session', { userType: 'company' }, undefined],
    ['company_session', { userType: 'admin' }, undefined],
    ['worker_session', { userType: 'worker' }, { id: 'unexpected' }],
  ])(
    'rejects a mismatched %s postcondition without recording trust',
    async (mode, user, apiKeyInfo) => {
      const rawSource: Record<string, unknown> =
        mode === 'legacy_api_key'
          ? { headers: { 'x-api-key': 'legacy' }, rawHeaders: ['X-API-Key', 'legacy'], cookies: {} }
          : mode === 'admin_session'
            ? { headers: {}, cookies: { 'admin-session': 'admin' } }
            : mode === 'company_session'
              ? { headers: {}, cookies: { 'company-session': 'company' } }
              : { headers: {}, cookies: { 'erp-session': 'worker' } };
      const apiKeyGuard = {
        canActivateStrict: jest.fn(async (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<Record<string, unknown>>();
          request.user = user;
          if (apiKeyInfo) request.apiKeyInfo = apiKeyInfo;
          return true;
        }),
      };
      const guard = new IntegrationPrincipalSourceGuard(
        { canActivate: jest.fn() } as unknown as DeviceBearerRequestSourceGuard,
        { canActivate: jest.fn() } as unknown as DeviceBearerGuard,
        apiKeyGuard as unknown as ApiKeyGuard
      );

      await expect(guard.canActivate(contextFor(rawSource))).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(getIntegrationPrincipalMode(rawSource as never)).toBeUndefined();
    }
  );
});
