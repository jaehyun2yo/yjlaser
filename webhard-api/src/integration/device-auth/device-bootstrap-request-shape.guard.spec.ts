import { BadRequestException, ExecutionContext } from '@nestjs/common';
import * as requestShapeGuards from './device-bootstrap-request-shape.guard';
import {
  DeviceBootstrapEnrollRequestShapeGuard,
  DeviceBootstrapStatusRequestShapeGuard,
} from './device-bootstrap-request-shape.guard';

function makeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
    }),
  } as ExecutionContext;
}

function enrollBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enrollmentCode: 'code',
    enrollmentAttemptId: 'attempt',
    displayName: 'device',
    refreshCredential: 'refresh',
    ...overrides,
  };
}

describe('DeviceBootstrapEnrollRequestShapeGuard', () => {
  it('allows only the exact enroll shape plus optional appVersion', () => {
    const guard = new DeviceBootstrapEnrollRequestShapeGuard();

    expect(guard.canActivate(makeContext(enrollBody()))).toBe(true);
    expect(guard.canActivate(makeContext(enrollBody({ appVersion: '1.2.3' })))).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    enrollBody({ ownerReference: 'private operator' }),
    enrollBody({ hostname: 'private-workstation' }),
    enrollBody({ metadata: { filePath: 'C:\\private\\drawing.dxf' } }),
    enrollBody({ environment: 'prd' }),
    Object.create(null),
  ])('rejects an invalid enroll raw body shape: %p', (body) => {
    const guard = new DeviceBootstrapEnrollRequestShapeGuard();

    expect(() => guard.canActivate(makeContext(body))).toThrow(BadRequestException);
  });
});

describe('DeviceBootstrapStatusRequestShapeGuard', () => {
  it('allows only the exact status proof shape', () => {
    const guard = new DeviceBootstrapStatusRequestShapeGuard();

    expect(
      guard.canActivate(
        makeContext({ enrollmentAttemptId: 'attempt', refreshCredential: 'refresh' })
      )
    ).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { enrollmentAttemptId: 'attempt' },
    { enrollmentAttemptId: 'attempt', refreshCredential: 'refresh', deviceId: 'untrusted' },
    { enrollmentAttemptId: 'attempt', refreshCredential: 'refresh', hostname: 'private' },
  ])('rejects an invalid status raw body shape: %p', (body) => {
    const guard = new DeviceBootstrapStatusRequestShapeGuard();

    expect(() => guard.canActivate(makeContext(body))).toThrow(BadRequestException);
  });
});

describe('DeviceTokenExchangeRequestShapeGuard', () => {
  it('is available to reject non-exact token exchange bodies before validation strips them', () => {
    expect(requestShapeGuards).toHaveProperty('DeviceTokenExchangeRequestShapeGuard');
  });

  it('allows only the exact four-key token exchange body', () => {
    const guard = new requestShapeGuards.DeviceTokenExchangeRequestShapeGuard();

    expect(
      guard.canActivate(
        makeContext({
          deviceId: '11111111-1111-4111-8111-111111111111',
          refreshCredential: 'refresh',
          nextRefreshCredential: 'next-refresh',
          refreshRequestId: 'request-id',
        })
      )
    ).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    {
      deviceId: '11111111-1111-4111-8111-111111111111',
      refreshCredential: 'refresh',
      nextRefreshCredential: 'next-refresh',
    },
    {
      deviceId: '11111111-1111-4111-8111-111111111111',
      refreshCredential: 'refresh',
      nextRefreshCredential: 'next-refresh',
      refreshRequestId: 'request-id',
      apiKey: 'legacy-key',
    },
    {
      deviceId: '11111111-1111-4111-8111-111111111111',
      refreshCredential: 'refresh',
      nextRefreshCredential: null,
      refreshRequestId: 'request-id',
    },
    Object.create(null),
  ])('rejects a non-exact token exchange raw body: %p', (body) => {
    const guard = new requestShapeGuards.DeviceTokenExchangeRequestShapeGuard();

    expect(() => guard.canActivate(makeContext(body))).toThrow(BadRequestException);
  });
});
