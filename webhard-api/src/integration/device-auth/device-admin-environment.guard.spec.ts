import { ConflictException, type ExecutionContext } from '@nestjs/common';
import type { DeviceAuthConfig } from './device-auth.config';
import { DeviceAdminEnvironmentGuard } from './device-admin-environment.guard';

function contextWithHeader(value: unknown): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          'x-device-auth-environment': value,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('DeviceAdminEnvironmentGuard', () => {
  const guard = new DeviceAdminEnvironmentGuard({
    environment: 'dev',
  } as DeviceAuthConfig);

  it('allows only the exact environment selected by the backend', () => {
    expect(guard.canActivate(contextWithHeader('dev'))).toBe(true);
  });

  it.each([undefined, '', 'prd', 'DEV', ['dev', 'prd']])(
    'rejects a missing, different, noncanonical, or duplicated expected environment: %p',
    (value) => {
      expect(() => guard.canActivate(contextWithHeader(value))).toThrow(ConflictException);
    }
  );

  it('returns a generic public error without reflecting the supplied environment', () => {
    try {
      guard.canActivate(contextWithHeader('private-environment-name'));
      throw new Error('expected guard rejection');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConflictException);
      expect(JSON.stringify(error)).not.toContain('private-environment-name');
    }
  });
});
