import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_EXEMPT_METADATA_KEY, CsrfExempt } from '../decorators/csrf-exempt.decorator';
import { CsrfGuard } from './csrf.guard';
import { DeviceBearerController } from '../../integration/device-auth/device-bearer.controller';

type LoggedSecurityEvent = {
  project?: string;
  component?: string;
  feature?: string;
  event?: string;
  status?: string;
  channel?: string;
  metadata: Record<string, unknown>;
};

function makeContext(input: {
  method: string;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  path?: string;
  handler?: Function;
  targetClass?: Function;
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
    getHandler: () => input.handler || (() => undefined),
    getClass: () => input.targetClass || class TestController {},
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('명시적으로 CsrfExempt 처리한 handler만 CSRF 검증을 건너뛴다', () => {
    class PublicDeviceAuthController {
      @CsrfExempt()
      public enroll(): void {}
    }

    const createGuardWithReflector = CsrfGuard as unknown as new (
      reflector: Reflector
    ) => CsrfGuard;
    const guard = new createGuardWithReflector(new Reflector());

    expect(
      guard.canActivate(
        makeContext({
          method: 'POST',
          handler: PublicDeviceAuthController.prototype.enroll,
          targetClass: PublicDeviceAuthController,
        })
      )
    ).toBe(true);
    expect(
      Reflect.getMetadata(CSRF_EXEMPT_METADATA_KEY, PublicDeviceAuthController.prototype.enroll)
    ).toBe(true);
  });

  it('명시적으로 CsrfExempt 처리한 controller class도 CSRF 검증을 건너뛴다', () => {
    @CsrfExempt()
    class PublicDeviceAuthController {
      public enrollmentStatus(): void {}
    }

    const createGuardWithReflector = CsrfGuard as unknown as new (
      reflector: Reflector
    ) => CsrfGuard;
    const guard = new createGuardWithReflector(new Reflector());

    expect(
      guard.canActivate(
        makeContext({
          method: 'POST',
          handler: PublicDeviceAuthController.prototype.enrollmentStatus,
          targetClass: PublicDeviceAuthController,
        })
      )
    ).toBe(true);
  });

  it.each(['heartbeat', 'canary'] as const)(
    'bearer device %s handler의 CSRF 면제는 명시적 metadata로만 적용된다',
    (methodName) => {
      const guard = new CsrfGuard(new Reflector());
      const handler = DeviceBearerController.prototype[methodName];

      expect(Reflect.getMetadata(CSRF_EXEMPT_METADATA_KEY, handler)).toBe(true);
      expect(
        guard.canActivate(
          makeContext({
            method: 'POST',
            path: `/api/v1/integration/devices/${methodName}`,
            handler,
            targetClass: DeviceBearerController,
          })
        )
      ).toBe(true);
    }
  );

  it('CsrfExempt metadata가 없는 handler는 Reflector가 있어도 기존 CSRF 검증을 유지한다', () => {
    const createGuardWithReflector = CsrfGuard as unknown as new (
      reflector: Reflector
    ) => CsrfGuard;
    const guard = new createGuardWithReflector(new Reflector());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('key와 csrf token이 없는 POST 요청은 거부한다', () => {
    const guard = new CsrfGuard();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

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
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

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
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

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

  it('로그 수집 전용 엔드포인트는 HMAC 필수 헤더가 빠져도 Auth verifier가 401을 결정하도록 CSRF 검증을 건너뛴다', () => {
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
          },
        })
      )
    ).toBe(true);
  });

  it('누락된 CSRF header 거부 로그에 raw csrf cookie를 남기지 않는다', () => {
    const guard = new CsrfGuard();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
          cookies: { 'csrf-token': 'raw-cookie-csrf-token' },
          path: '/api/v1/contacts',
        })
      )
    ).toThrow(ForbiddenException);

    const event = findJsonLogEvent(warnSpy, 'csrf_rejected');
    const serialized = JSON.stringify(event);
    expect(event.project).toBe('company_site');
    expect(event.component).toBe('CsrfGuard');
    expect(event.feature).toBe('auth');
    expect(event.status).toBe('failure');
    expect(event.channel).toBe('security');
    expect(event.metadata.reason).toBe('missing_header_token');
    expect(serialized).not.toContain('raw-cookie-csrf-token');
  });

  it('CSRF mismatch 거부 로그에 raw csrf cookie/header 값을 남기지 않는다', () => {
    const guard = new CsrfGuard();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
          headers: { 'x-csrf-token': 'raw-header-csrf-token' },
          cookies: { 'csrf-token': 'raw-cookie-csrf-token' },
          path: '/api/v1/contacts',
        })
      )
    ).toThrow(ForbiddenException);

    const event = findJsonLogEvent(warnSpy, 'csrf_rejected');
    const serialized = JSON.stringify(event);
    expect(event.event).toBe('csrf_rejected');
    expect(event.metadata.reason).toBe('token_mismatch');
    expect(serialized).not.toContain('raw-cookie-csrf-token');
    expect(serialized).not.toContain('raw-header-csrf-token');
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
