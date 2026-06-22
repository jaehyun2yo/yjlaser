import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthService } from '../../auth/auth.service';
import { ALLOW_WORKER_SESSION_KEY } from './allow-worker-session.decorator';
import { INTEGRATION_PERMISSION_KEY } from './require-integration-permission.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

describe('ApiKeyGuard principal model', () => {
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

    const guard = new ApiKeyGuard(reflector, apiKeyService, authService);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(ForbiddenException);
  });
});
