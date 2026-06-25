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
