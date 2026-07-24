import {
  ExecutionContext,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthService } from '../../auth/auth.service';
import { ALLOW_WORKER_SESSION_KEY } from './allow-worker-session.decorator';
import { INTEGRATION_PERMISSION_KEY } from './require-integration-permission.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

type LoggedSecurityEvent = {
  project?: string;
  component?: string;
  feature?: string;
  event?: string;
  status?: string;
  channel?: string;
  actor_type?: string;
  actor_id_hash?: string;
  metadata: Record<string, unknown>;
};

describe('ApiKeyGuard principal model', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it.each([
    {
      headers: { authorization: 'Bearer token', 'x-api-key': 'legacy' },
      rawHeaders: ['Authorization', 'Bearer token', 'X-API-Key', 'legacy'],
      cookies: {},
    },
    { headers: { 'x-api-key': 'legacy' }, cookies: { 'admin-session': 'admin' } },
    { headers: {}, cookies: { 'admin-session': 'admin', 'company-session': 'company' } },
    {
      headers: { 'x-api-key': ['first', 'second'] },
      rawHeaders: ['X-API-Key', 'first', 'X-API-Key', 'second'],
      cookies: {},
    },
    {
      headers: { cookie: 'erp-session=first; worker-session=second' },
      rawHeaders: ['Cookie', 'erp-session=first; worker-session=second'],
      cookies: { 'erp-session': 'first', 'worker-session': 'second' },
    },
    {
      headers: { cookie: 'admin-session=first, company-session=second' },
      rawHeaders: ['Cookie', 'admin-session=first, company-session=second'],
      cookies: { 'admin-session': 'first, company-session=second' },
    },
  ])(
    'rejects raw credential-source ambiguity before public metadata or mutation %#',
    async (request) => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(true),
      } as unknown as Reflector;
      const apiKeyService = { validateKey: jest.fn() } as unknown as ApiKeyService;
      const authService = {
        verifySession: jest.fn(),
        verifyWorkerSession: jest.fn(),
      } as unknown as AuthService;
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

      await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(reflector.getAllAndOverride).not.toHaveBeenCalled();
      expect(apiKeyService.validateKey).not.toHaveBeenCalled();
      expect(authService.verifySession).not.toHaveBeenCalled();
      expect(authService.verifyWorkerSession).not.toHaveBeenCalled();
      expect((request as { user?: unknown }).user).toBeUndefined();
      expect((request as { apiKeyInfo?: unknown }).apiKeyInfo).toBeUndefined();
    }
  );

  it('does not model a valid API key as an admin session user', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const keyInfo = {
      id: 'api-key-1',
      programType: 'lgu-sync',
      permissions: ['contacts:read'],
    };
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue(keyInfo),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: {},
      headers: { 'x-api-key': 'valid-key' },
    } as Record<string, unknown>;

    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect((request as { user?: { userType?: string } }).user?.userType).not.toBe('admin');
    expect((request as { apiKeyInfo?: typeof keyInfo }).apiKeyInfo).toEqual(keyInfo);
  });

  it('preserves standalone @Public bypass but authenticates a valid API key through the strict entrypoint', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY),
    } as unknown as Reflector;
    const keyInfo = {
      id: 'api-key-public-strict',
      programType: 'management_program',
      permissions: ['event/write'],
    };
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue(keyInfo),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);
    const publicRequest = { cookies: {}, headers: {} } as Record<string, unknown>;
    const strictRequest = {
      cookies: {},
      headers: { 'x-api-key': 'valid-public-key' },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createContext(publicRequest))).resolves.toBe(true);
    expect(apiKeyService.validateKey).not.toHaveBeenCalled();

    await expect(guard.canActivateStrict(createContext(strictRequest))).resolves.toBe(true);
    expect(apiKeyService.validateKey).toHaveBeenCalledWith('valid-public-key');
    expect((strictRequest as { user?: { userType?: string } }).user?.userType).toBe('integration');
    expect((strictRequest as { apiKeyInfo?: typeof keyInfo }).apiKeyInfo).toEqual(keyInfo);
  });

  it('rejects missing credentials through the strict entrypoint even when the route is @Public', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY),
    } as unknown as Reflector;
    const apiKeyService = { validateKey: jest.fn() } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(
      guard.canActivateStrict(createContext({ cookies: {}, headers: {} }))
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('authenticates a valid admin session through the strict entrypoint on an @Public route', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY),
    } as unknown as Reflector;
    const expectedUser = { userType: 'admin', userId: 'admin-public', companyId: null };
    const apiKeyService = { validateKey: jest.fn() } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(expectedUser),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);
    const request = {
      headers: {},
      cookies: { 'admin-session': 'valid-admin-session' },
    } as Record<string, unknown>;

    await expect(guard.canActivateStrict(createContext(request))).resolves.toBe(true);
    expect(authService.verifySession).toHaveBeenCalledWith('valid-admin-session');
    expect((request as { user?: unknown }).user).toBe(expectedUser);
  });

  it('allows an API key principal when route metadata permission is included', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY || key === ALLOW_WORKER_SESSION_KEY) return false;
        if (key === INTEGRATION_PERMISSION_KEY) return 'event/write';
        return undefined;
      }),
    } as unknown as Reflector;
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue({
        id: 'api-key-2',
        programType: 'management_program',
        permissions: ['event/write'],
      }),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: {},
      headers: { 'x-api-key': 'valid-key' },
    } as Record<string, unknown>;

    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('allows legacy all permission as a server-to-server wildcard', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY || key === ALLOW_WORKER_SESSION_KEY) return false;
        if (key === INTEGRATION_PERMISSION_KEY) return 'job/read';
        return undefined;
      }),
    } as unknown as Reflector;
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue({
        id: 'api-key-all',
        programType: 'migration',
        permissions: ['all'],
      }),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: {},
      headers: { 'x-api-key': 'server-key' },
    } as Record<string, unknown>;

    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('rejects an API key principal when route metadata permission is missing', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY || key === ALLOW_WORKER_SESSION_KEY) return false;
        if (key === INTEGRATION_PERMISSION_KEY) return 'file/register';
        return undefined;
      }),
    } as unknown as Reflector;
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue({
        id: 'api-key-3',
        programType: 'management_program',
        permissions: ['event/write'],
      }),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: {},
      headers: { 'x-api-key': 'valid-key' },
    } as Record<string, unknown>;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(ForbiddenException);
  });

  it('rejects external_webhard_sync API keys from job/read routes', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY || key === ALLOW_WORKER_SESSION_KEY) return false;
        if (key === INTEGRATION_PERMISSION_KEY) return 'job/read';
        return undefined;
      }),
    } as unknown as Reflector;
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue({
        id: 'api-key-external-sync',
        programType: 'external_webhard_sync',
        permissions: ['file/register', 'event/write'],
      }),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: {},
      headers: { 'x-api-key': 'external-sync-key' },
    } as Record<string, unknown>;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(ForbiddenException);
  });

  it('logs rejected API keys without the submitted raw key', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue(null),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: {},
      headers: { 'x-api-key': 'raw-submitted-api-key' },
    } as Record<string, unknown>;
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(UnauthorizedException);

    const event = findJsonLogEvent(warnSpy, 'api_key_rejected');
    const serialized = JSON.stringify(event);
    expect(event.project).toBe('company_site');
    expect(event.component).toBe('ApiKeyGuard');
    expect(event.feature).toBe('auth');
    expect(event.status).toBe('failure');
    expect(event.channel).toBe('security');
    expect(event.actor_type).toBe('api_client');
    expect(event.actor_id_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(event.metadata.reason).toBe('invalid_key');
    expect(serialized).not.toContain('raw-submitted-api-key');
  });

  it('logs permission denial without the submitted raw key', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY || key === ALLOW_WORKER_SESSION_KEY) return false;
        if (key === INTEGRATION_PERMISSION_KEY) return 'file/register';
        return undefined;
      }),
    } as unknown as Reflector;
    const apiKeyService = {
      validateKey: jest.fn().mockResolvedValue({
        id: 'api-key-3',
        programType: 'management_program',
        permissions: ['event/write'],
      }),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: {},
      headers: { 'x-api-key': 'raw-submitted-api-key' },
    } as Record<string, unknown>;
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(ForbiddenException);

    const event = findJsonLogEvent(warnSpy, 'api_key_permission_denied');
    const serialized = JSON.stringify(event);
    expect(event.project).toBe('company_site');
    expect(event.event).toBe('api_key_permission_denied');
    expect(event.metadata.reason).toBe('permission_denied');
    expect(event.metadata.required_permission).toBe('file/register');
    expect(event.actor_id_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(serialized).not.toContain('raw-submitted-api-key');
  });

  it('logs missing credentials without raw session cookies', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const apiKeyService = {
      validateKey: jest.fn(),
    } as unknown as ApiKeyService;
    const authService = {
      verifySession: jest.fn().mockReturnValue(null),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    const request = {
      cookies: { 'admin-session': 'raw-session-cookie' },
      headers: {},
    } as Record<string, unknown>;
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(UnauthorizedException);

    const event = findJsonLogEvent(warnSpy, 'integration_auth_rejected');
    const serialized = JSON.stringify(event);
    expect(event.event).toBe('integration_auth_rejected');
    expect(event.metadata.reason).toBe('missing_credentials');
    expect(event.actor_type).toBe('anonymous');
    expect(serialized).not.toContain('raw-session-cookie');
  });
});

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedSecurityEvent {
  for (const [message] of spy.mock.calls) {
    const text = String(message);
    if (!text.includes(eventName)) continue;
    return JSON.parse(text) as LoggedSecurityEvent;
  }
  throw new Error(`log event not found: ${eventName}`);
}
