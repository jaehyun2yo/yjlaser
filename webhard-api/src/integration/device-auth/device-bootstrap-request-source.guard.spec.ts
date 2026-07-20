import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { DeviceBootstrapRequestSourceGuard } from './device-bootstrap-request-source.guard';

function makeContext(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

describe('DeviceBootstrapRequestSourceGuard', () => {
  it('allows a cookie-less request with no ambient credential or browser headers', () => {
    const guard = new DeviceBootstrapRequestSourceGuard();

    expect(guard.canActivate(makeContext({ 'content-type': 'application/json' }))).toBe(true);
  });

  it.each([
    ['authorization', 'Bearer raw-access-token'],
    ['authorization', ''],
    ['proxy-authorization', 'Basic proxy-secret'],
    ['cookie', 'admin-session=raw-session'],
    ['x-api-key', 'legacy-api-key'],
    ['x-account-recovery-key', 'recovery-key'],
    ['x-csrf-token', 'csrf-token'],
    ['x-session-token', 'session-token'],
    ['x-session-token', ''],
    ['x-session-token', ['session-token', 'second-session-token']],
    ['origin', 'https://www.yjlaser.net'],
    ['referer', 'https://www.yjlaser.net/admin'],
  ])('rejects %s based on header presence without echoing its value', (headerName, headerValue) => {
    const guard = new DeviceBootstrapRequestSourceGuard();

    expect(() => guard.canActivate(makeContext({ [headerName]: headerValue }))).toThrow(
      BadRequestException
    );
    try {
      guard.canActivate(makeContext({ [headerName]: headerValue }));
    } catch (error: unknown) {
      if (typeof headerValue === 'string' && headerValue.length > 0) {
        expect(String(error)).not.toContain(headerValue);
      }
    }
  });
});
