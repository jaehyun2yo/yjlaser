import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ProgramsAccessGuard } from './programs-access.guard';

type ProgramRequest = {
  method: string;
  user?: {
    userType: 'admin' | 'company' | 'worker' | 'integration';
    userId: string | number;
    companyId: number | null;
  };
  apiKeyInfo?: {
    id: string;
    programType: string;
    permissions: string[];
  };
};

function createContext(request: ProgramRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function apiKeyRequest(method: string, permissions: string[]): ProgramRequest {
  return {
    method,
    user: {
      userType: 'integration',
      userId: 'api:program',
      companyId: null,
    },
    apiKeyInfo: {
      id: 'key-001',
      programType: 'program',
      permissions,
    },
  };
}

describe('ProgramsAccessGuard legacy principal boundary', () => {
  const guard = new ProgramsAccessGuard();

  it('allows only event/write or all API-key principals to POST heartbeats', () => {
    expect(guard.canActivate(createContext(apiKeyRequest('POST', ['event/write'])))).toBe(true);
    expect(guard.canActivate(createContext(apiKeyRequest('POST', ['all'])))).toBe(true);
  });

  it.each([
    {
      name: 'admin session',
      request: {
        method: 'POST',
        user: { userType: 'admin' as const, userId: 'admin', companyId: null },
      },
    },
    {
      name: 'company session',
      request: {
        method: 'POST',
        user: { userType: 'company' as const, userId: 7, companyId: 7 },
      },
    },
    {
      name: 'worker session',
      request: {
        method: 'POST',
        user: { userType: 'worker' as const, userId: 'worker-1', companyId: null },
      },
    },
    {
      name: 'operation read API key',
      request: apiKeyRequest('POST', ['operation/read']),
    },
  ])('rejects $name from POST heartbeat access', ({ request }) => {
    expect(() => guard.canActivate(createContext(request))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext(request))).toThrow(
      'Program heartbeat write access required'
    );
  });

  it('allows admin sessions and operation/read or all API-key principals to GET programs', () => {
    expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          user: { userType: 'admin', userId: 'admin', companyId: null },
        })
      )
    ).toBe(true);
    expect(guard.canActivate(createContext(apiKeyRequest('GET', ['operation/read'])))).toBe(true);
    expect(guard.canActivate(createContext(apiKeyRequest('GET', ['all'])))).toBe(true);
  });

  it.each([
    {
      name: 'company session',
      request: {
        method: 'GET',
        user: { userType: 'company' as const, userId: 7, companyId: 7 },
      },
    },
    {
      name: 'worker session',
      request: {
        method: 'GET',
        user: { userType: 'worker' as const, userId: 'worker-1', companyId: null },
      },
    },
    {
      name: 'event write API key',
      request: apiKeyRequest('GET', ['event/write']),
    },
    {
      name: 'other integration API key',
      request: apiKeyRequest('GET', ['file/register']),
    },
    {
      name: 'admin-shaped API key principal',
      request: {
        ...apiKeyRequest('GET', ['file/register']),
        user: { userType: 'admin' as const, userId: 'api:legacy', companyId: null },
      },
    },
  ])('rejects $name from GET program list access', ({ request }) => {
    expect(() => guard.canActivate(createContext(request))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext(request))).toThrow('Program list read access required');
  });

  it('fails closed for an unexpected route method', () => {
    expect(() => guard.canActivate(createContext(apiKeyRequest('PATCH', ['all'])))).toThrow(
      ForbiddenException
    );
  });
});
