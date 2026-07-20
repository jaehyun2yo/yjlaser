import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import * as rateGuards from './device-bootstrap-rate.guard';
import {
  DeviceBootstrapEnrollmentRateGuard,
  DeviceBootstrapStatusRateGuard,
  getEnrollmentReplayLease,
  getTokenExchangeRequestLease,
} from './device-bootstrap-rate.guard';
import type { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';

const ENROLLMENT_CODE = 'enrollment-code-fixture';
const ENROLLMENT_ATTEMPT = 'enrollment-attempt-fixture';
const REFRESH_CREDENTIAL = 'refresh-credential-fixture';

function makeContext(input: {
  readonly body: unknown;
  readonly peerAddress?: string;
  readonly headers?: Record<string, string | undefined>;
}): {
  readonly context: ExecutionContext;
  readonly request: Record<PropertyKey, unknown>;
  readonly response: { setHeader: jest.Mock };
} {
  const request: Record<PropertyKey, unknown> = {
    body: input.body,
    headers: input.headers ?? {},
    socket: { remoteAddress: input.peerAddress },
  };
  const response = { setHeader: jest.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, request, response };
}

function makeRateStore(): {
  readonly store: DeviceBootstrapRateStore;
  readonly acquireEnrollment: jest.Mock;
  readonly checkEnrollmentStatus: jest.Mock;
  readonly acquireTokenExchange: jest.Mock;
} {
  const acquireEnrollment = jest.fn();
  const checkEnrollmentStatus = jest.fn();
  const acquireTokenExchange = jest.fn();
  return {
    store: {
      acquireEnrollment,
      checkEnrollmentStatus,
      acquireTokenExchange,
    } as unknown as DeviceBootstrapRateStore,
    acquireEnrollment,
    checkEnrollmentStatus,
    acquireTokenExchange,
  };
}

describe('DeviceBootstrapEnrollmentRateGuard', () => {
  it('uses the socket peer rather than a client-provided forwarding header and stores only the opaque lease', async () => {
    const { store, acquireEnrollment } = makeRateStore();
    acquireEnrollment.mockResolvedValue({
      kind: 'allowed',
      replayLease: { nonce: 'synthetic-replay-nonce' },
    });
    const guard = new DeviceBootstrapEnrollmentRateGuard(store);
    const { context, request } = makeContext({
      body: {
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT,
      },
      peerAddress: '198.51.100.17',
      headers: { 'x-forwarded-for': '203.0.113.99' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(acquireEnrollment).toHaveBeenCalledWith({
      peerAddress: '198.51.100.17',
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: ENROLLMENT_ATTEMPT,
    });
    expect(getEnrollmentReplayLease(request as never)).toEqual({ nonce: 'synthetic-replay-nonce' });
  });

  it('fails before the rate store if an expected proof is absent', async () => {
    const { store, acquireEnrollment } = makeRateStore();
    const guard = new DeviceBootstrapEnrollmentRateGuard(store);
    const { context } = makeContext({ body: { enrollmentCode: ENROLLMENT_CODE } });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 400,
    });
    expect(acquireEnrollment).not.toHaveBeenCalled();
  });

  it('returns a generic 429 with a bounded Retry-After value', async () => {
    const { store, acquireEnrollment } = makeRateStore();
    acquireEnrollment.mockResolvedValue({ kind: 'limited', retryAfterSeconds: 17 });
    const guard = new DeviceBootstrapEnrollmentRateGuard(store);
    const { context, response } = makeContext({
      body: {
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT,
      },
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '17');
  });

  it('maps a rate-store outage to a generic 503', async () => {
    const { store, acquireEnrollment } = makeRateStore();
    acquireEnrollment.mockResolvedValue({ kind: 'unavailable' });
    const guard = new DeviceBootstrapEnrollmentRateGuard(store);
    const { context } = makeContext({
      body: {
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT,
      },
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 503 });
  });
});

describe('DeviceBootstrapStatusRateGuard', () => {
  it('limits status polling by socket peer and refresh proof without a replay lease', async () => {
    const { store, checkEnrollmentStatus } = makeRateStore();
    checkEnrollmentStatus.mockResolvedValue({ kind: 'allowed' });
    const guard = new DeviceBootstrapStatusRateGuard(store);
    const { context, request } = makeContext({
      body: { refreshCredential: REFRESH_CREDENTIAL },
      peerAddress: '198.51.100.18',
      headers: { 'x-forwarded-for': '203.0.113.100' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkEnrollmentStatus).toHaveBeenCalledWith({
      peerAddress: '198.51.100.18',
      refreshCredential: REFRESH_CREDENTIAL,
    });
    expect(getEnrollmentReplayLease(request as never)).toBeUndefined();
  });

  it('does not reflect a rate-store failure through an unexpected exception type', async () => {
    const { store, checkEnrollmentStatus } = makeRateStore();
    checkEnrollmentStatus.mockResolvedValue({ kind: 'unavailable' });
    const guard = new DeviceBootstrapStatusRateGuard(store);
    const { context } = makeContext({ body: { refreshCredential: REFRESH_CREDENTIAL } });

    try {
      await guard.canActivate(context);
      throw new Error('expected rate-store failure');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(503);
      expect(JSON.stringify((error as HttpException).getResponse())).not.toContain(
        REFRESH_CREDENTIAL
      );
    }
  });
});

describe('DeviceBootstrapTokenExchangeRateGuard', () => {
  it('uses the socket peer and refresh proof, not forwarding headers, then stores only the opaque lease', async () => {
    const { store, acquireTokenExchange } = makeRateStore();
    acquireTokenExchange.mockResolvedValue({
      kind: 'allowed',
      requestLease: { nonce: 'synthetic-token-request-lease' },
    });
    const guard = new rateGuards.DeviceBootstrapTokenExchangeRateGuard(store);
    const { context, request } = makeContext({
      body: {
        refreshCredential: REFRESH_CREDENTIAL,
        refreshRequestId: 'refresh-request-id-fixture',
      },
      peerAddress: '198.51.100.19',
      headers: { 'x-forwarded-for': '203.0.113.101' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(acquireTokenExchange).toHaveBeenCalledWith({
      peerAddress: '198.51.100.19',
      refreshCredential: REFRESH_CREDENTIAL,
      refreshRequestId: 'refresh-request-id-fixture',
    });
    expect(getTokenExchangeRequestLease(request as never)).toEqual({
      nonce: 'synthetic-token-request-lease',
    });
  });

  it('maps token rate and store failures without passing a request to the service', async () => {
    const { store, acquireTokenExchange } = makeRateStore();
    const guard = new rateGuards.DeviceBootstrapTokenExchangeRateGuard(store);
    const { context, response } = makeContext({
      body: {
        refreshCredential: REFRESH_CREDENTIAL,
        refreshRequestId: 'refresh-request-id-fixture',
      },
    });

    acquireTokenExchange.mockResolvedValue({ kind: 'limited', retryAfterSeconds: 19 });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '19');

    acquireTokenExchange.mockResolvedValue({ kind: 'unavailable' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 503 });
  });
});
