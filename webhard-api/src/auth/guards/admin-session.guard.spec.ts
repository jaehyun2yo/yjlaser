import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminSessionGuard } from './admin-session.guard';

describe('AdminSessionGuard', () => {
  const guard = new AdminSessionGuard();

  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('admin 세션 user 통과', () => {
    const ctx = createContext({
      user: { userType: 'admin', userId: 'admin', companyId: null },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('user 없으면 ForbiddenException (Admin access required)', () => {
    const ctx = createContext({});
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Admin access required');
  });

  it('company 세션 user → ForbiddenException (Admin access required)', () => {
    const ctx = createContext({
      user: { userType: 'company', userId: 7, companyId: 7 },
    });
    expect(() => guard.canActivate(ctx)).toThrow('Admin access required');
  });

  it('API Key 인증 (apiKeyInfo 존재) → admin userType 이어도 차단', () => {
    const ctx = createContext({
      user: { userType: 'admin', userId: 'api:lgu-sync', companyId: 0 },
      apiKeyInfo: { programType: 'lgu-sync' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Admin session required (API key not allowed)');
  });
});
