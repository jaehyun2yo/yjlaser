import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows a verified admin session user', () => {
    const ctx = createContext({
      user: { userType: 'admin', userId: 'admin', companyId: 0 },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects company session users', () => {
    const ctx = createContext({
      user: { userType: 'company', userId: 7, companyId: 7 },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects API-key principals even if legacy code mapped them to userType admin', () => {
    const ctx = createContext({
      user: { userType: 'admin', userId: 'api:lgu-sync', companyId: 0 },
      apiKeyInfo: { id: 'key-1', programType: 'lgu-sync', permissions: ['contacts:read'] },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
