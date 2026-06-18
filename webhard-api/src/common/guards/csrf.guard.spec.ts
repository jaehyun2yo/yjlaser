import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

function makeContext(input: {
  method: string;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  path?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: input.method,
        headers: input.headers || {},
        cookies: input.cookies,
        path: input.path || '/api/v1/auth/find-id/request',
      }),
    }),
  } as ExecutionContext;
}

describe('CsrfGuard', () => {
  it('계정 복구 server-to-server key 요청은 CSRF 검증을 건너뛴다', () => {
    const guard = new CsrfGuard();

    expect(
      guard.canActivate(
        makeContext({
          method: 'POST',
          headers: { 'x-account-recovery-key': 'recovery-secret' },
        })
      )
    ).toBe(true);
  });

  it('key와 csrf token이 없는 POST 요청은 거부한다', () => {
    const guard = new CsrfGuard();

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
        })
      )
    ).toThrow(ForbiddenException);
  });
});
