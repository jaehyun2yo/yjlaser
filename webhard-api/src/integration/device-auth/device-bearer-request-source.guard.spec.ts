import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';

function makeContext(input: {
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly rawHeaders?: string[];
}): ExecutionContext {
  const request = {
    headers: input.headers ?? {},
    rawHeaders: input.rawHeaders ?? [],
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('DeviceBearerRequestSourceGuard', () => {
  it('accepts exactly one raw canonical Bearer authorization and stores only its token', () => {
    const guard = new DeviceBearerRequestSourceGuard();
    const context = makeContext({
      headers: { authorization: 'Bearer synthetic.jwt.token' },
      rawHeaders: ['Authorization', 'Bearer synthetic.jwt.token'],
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(DeviceBearerRequestSourceGuard.getBearerToken(context)).toBe('synthetic.jwt.token');
  });

  it.each([
    { headers: {}, rawHeaders: [] },
    { headers: { authorization: '' }, rawHeaders: ['Authorization', ''] },
    { headers: { authorization: 'bearer token' }, rawHeaders: ['Authorization', 'bearer token'] },
    { headers: { authorization: 'Bearer' }, rawHeaders: ['Authorization', 'Bearer'] },
    {
      headers: { authorization: 'Bearer first, Bearer second' },
      rawHeaders: ['Authorization', 'Bearer first, Bearer second'],
    },
    {
      headers: { authorization: 'Bearer second' },
      rawHeaders: ['Authorization', 'Bearer first', 'Authorization', 'Bearer second'],
    },
    {
      headers: { authorization: ['Bearer first', 'Bearer second'] },
      rawHeaders: [],
    },
    {
      headers: { authorization: 'Basic legacy' },
      rawHeaders: ['Authorization', 'Basic legacy'],
    },
  ])('rejects malformed, missing, combined, or multiple authorization source %#', (input) => {
    const guard = new DeviceBearerRequestSourceGuard();
    expect(() => guard.canActivate(makeContext(input))).toThrow(UnauthorizedException);
  });

  it.each([
    ['cookie', 'admin-session=secret'],
    ['x-api-key', 'legacy-key'],
    ['x-account-recovery-key', 'recovery-key'],
    ['x-csrf-token', 'csrf-token'],
    ['x-session-token', 'session-token'],
    ['proxy-authorization', 'Basic proxy-secret'],
    ['origin', 'https://example.test'],
    ['referer', 'https://example.test/admin'],
  ])('rejects ambient %s with no value reflection', (header, rawValue) => {
    const guard = new DeviceBearerRequestSourceGuard();
    const context = makeContext({
      headers: { authorization: 'Bearer token', [header]: rawValue },
      rawHeaders: ['Authorization', 'Bearer token', header, rawValue],
    });

    try {
      guard.canActivate(context);
      throw new Error('expected source rejection');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(String(error)).not.toContain(rawValue);
    }
  });
});
