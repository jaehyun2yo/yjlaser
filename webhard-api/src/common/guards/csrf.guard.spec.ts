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
          headers: { 'x-account-recovery-key': 'recovery-fixture' },
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

  it('로그 수집 HMAC 헤더가 모두 있는 전용 엔드포인트는 CSRF 검증을 건너뛴다', () => {
    const guard = new CsrfGuard();

    expect(
      guard.canActivate(
        makeContext({
          method: 'POST',
          path: '/api/v1/integration/log-events',
          headers: {
            'x-log-client-id': 'company-site',
            'x-log-key-id': 'local-test-key',
            'x-log-timestamp': '2026-06-22T00:00:00.000Z',
            'x-log-nonce': 'nonce-1',
            'x-log-signature': 'signature',
          },
        })
      )
    ).toBe(true);
  });

  it('로그 수집 HMAC 헤더가 있어도 다른 경로는 CSRF 검증을 우회하지 못한다', () => {
    const guard = new CsrfGuard();

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
          path: '/api/v1/contacts',
          headers: {
            'x-log-client-id': 'company-site',
            'x-log-key-id': 'local-test-key',
            'x-log-timestamp': '2026-06-22T00:00:00.000Z',
            'x-log-nonce': 'nonce-1',
            'x-log-signature': 'signature',
          },
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('로그 수집 경로를 suffix로 포함한 다른 경로는 CSRF 검증을 우회하지 못한다', () => {
    const guard = new CsrfGuard();

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
          path: '/api/v1/admin/proxy/api/v1/integration/log-events',
          headers: {
            'x-log-client-id': 'company-site',
            'x-log-key-id': 'local-test-key',
            'x-log-timestamp': '2026-06-22T00:00:00.000Z',
            'x-log-nonce': 'nonce-1',
            'x-log-signature': 'signature',
          },
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('로그 수집 전용 엔드포인트여도 HMAC 필수 헤더가 빠지면 CSRF 검증을 우회하지 못한다', () => {
    const guard = new CsrfGuard();

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
          path: '/api/v1/integration/log-events',
          headers: {
            'x-log-client-id': 'company-site',
            'x-log-key-id': 'local-test-key',
            'x-log-timestamp': '2026-06-22T00:00:00.000Z',
            'x-log-nonce': 'nonce-1',
          },
        })
      )
    ).toThrow(ForbiddenException);
  });
});
