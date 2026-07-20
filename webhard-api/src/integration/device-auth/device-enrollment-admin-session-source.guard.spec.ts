import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';

function makeContext(
  headers: Record<string, string | string[] | undefined>,
  rawHeaders: unknown = []
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, rawHeaders }),
    }),
  } as ExecutionContext;
}

describe('DeviceEnrollmentAdminSessionSourceGuard', () => {
  it('allows exactly one nonempty admin session and unrelated CSRF cookie', () => {
    const guard = new DeviceEnrollmentAdminSessionSourceGuard();

    expect(
      guard.canActivate(
        makeContext({ cookie: 'admin-session=admin-token; csrf-token=csrf-token' }, [
          'Cookie',
          'admin-session=admin-token; csrf-token=csrf-token',
        ])
      )
    ).toBe(true);
  });

  it('allows a canonical admin session when a unit-test request omits rawHeaders', () => {
    const guard = new DeviceEnrollmentAdminSessionSourceGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { cookie: 'admin-session=admin-token' } }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it.each([{}, 'not-a-header-array'])(
    'falls back to the canonical cookie projection for invalid rawHeaders: %p',
    (rawHeaders) => {
      const guard = new DeviceEnrollmentAdminSessionSourceGuard();

      expect(
        guard.canActivate(makeContext({ cookie: 'admin-session=admin-token' }, rawHeaders))
      ).toBe(true);
    }
  );

  it.each([
    ['', []],
    ['admin-session=', ['Cookie', 'admin-session=']],
    ['company-session=admin-token', ['Cookie', 'company-session=admin-token']],
    ['worker-session=worker-token', ['Cookie', 'worker-session=worker-token']],
    ['erp-session=worker-token', ['Cookie', 'erp-session=worker-token']],
    [
      'admin-session=admin-token; company-session=company-token',
      ['Cookie', 'admin-session=admin-token; company-session=company-token'],
    ],
    [
      'admin-session=first; admin-session=second',
      ['Cookie', 'admin-session=first; admin-session=second'],
    ],
  ])('rejects a non-exclusive admin session cookie source: %p', (cookie, rawHeaders) => {
    const guard = new DeviceEnrollmentAdminSessionSourceGuard();
    expect(() => guard.canActivate(makeContext({ cookie }, rawHeaders))).toThrow(
      ForbiddenException
    );
  });

  it('rejects duplicated Cookie headers even when both contain the same admin session', () => {
    const guard = new DeviceEnrollmentAdminSessionSourceGuard();
    expect(() =>
      guard.canActivate(
        makeContext({ cookie: 'admin-session=admin-token; admin-session=admin-token' }, [
          'Cookie',
          'admin-session=admin-token',
          'Cookie',
          'admin-session=admin-token',
        ])
      )
    ).toThrow(ForbiddenException);
  });

  it.each([
    ['x-api-key', 'integration-key'],
    ['x-api-key', ''],
    ['x-api-key', ['integration-key']],
    ['x-account-recovery-key', 'recovery-key'],
    ['x-account-recovery-key', ''],
    ['x-account-recovery-key', ['recovery-key']],
    ['authorization', 'Bearer raw-access-token'],
    ['authorization', ''],
    ['authorization', ['Bearer first-token', 'Bearer second-token']],
    ['proxy-authorization', 'Basic raw-proxy-token'],
    ['x-session-token', 'raw-session-token'],
  ])(
    'rejects any CSRF-exempt credential header before the controller: %p=%p',
    (headerName, value) => {
      const guard = new DeviceEnrollmentAdminSessionSourceGuard();
      const headers = { [headerName]: value };

      expect(() => guard.canActivate(makeContext(headers))).toThrow(ForbiddenException);
      try {
        guard.canActivate(makeContext(headers));
      } catch (error: unknown) {
        expect(String(error)).not.toContain('integration-key');
        expect(String(error)).not.toContain('recovery-key');
      }
    }
  );

  it.each([
    ['Authorization', '', 'Bearer raw-access-token'],
    ['X-API-Key', '', 'integration-key'],
    ['X-Account-Recovery-Key', '', 'recovery-key'],
  ])(
    'rejects duplicated raw %s headers even when their normalized projection is absent',
    (headerName, firstValue, secondValue) => {
      const guard = new DeviceEnrollmentAdminSessionSourceGuard();

      expect(() =>
        guard.canActivate(makeContext({}, [headerName, firstValue, headerName, secondValue]))
      ).toThrow(ForbiddenException);
    }
  );
});
