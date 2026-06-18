import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthService } from '../../auth/auth.service';

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
});
