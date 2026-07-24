import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  DeviceBootstrapRateStore,
  type DeviceBootstrapReplayLease,
} from './device-bootstrap-rate-store';
import {
  invalidBootstrapRequest,
  rateLimitedDeviceAuth,
  unavailableDeviceAuth,
} from './device-bootstrap.errors';

export const DEVICE_BOOTSTRAP_ENROLLMENT_REPLAY_LEASE = Symbol(
  'DEVICE_BOOTSTRAP_ENROLLMENT_REPLAY_LEASE'
);
export const DEVICE_BOOTSTRAP_TOKEN_EXCHANGE_REQUEST_LEASE = Symbol(
  'DEVICE_BOOTSTRAP_TOKEN_EXCHANGE_REQUEST_LEASE'
);

type BootstrapRequestWithReplayLease = Request & {
  [DEVICE_BOOTSTRAP_ENROLLMENT_REPLAY_LEASE]?: DeviceBootstrapReplayLease;
  [DEVICE_BOOTSTRAP_TOKEN_EXCHANGE_REQUEST_LEASE]?: DeviceBootstrapReplayLease;
};

/**
 * Runs only after the exact raw-body shape guard. It uses the network peer
 * rather than client-provided forwarding headers, and sends raw proofs only to
 * the store's HMAC boundary.
 */
@Injectable()
export class DeviceBootstrapEnrollmentRateGuard implements CanActivate {
  public constructor(private readonly rateStore: DeviceBootstrapRateStore) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BootstrapRequestWithReplayLease>();
    const response = context.switchToHttp().getResponse<Response>();
    const input = readEnrollmentRateInput(request);
    const decision = await this.rateStore.acquireEnrollment(input);
    if (decision.kind === 'unavailable') {
      throw unavailableDeviceAuth();
    }
    if (decision.kind === 'limited') {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw rateLimitedDeviceAuth();
    }

    request[DEVICE_BOOTSTRAP_ENROLLMENT_REPLAY_LEASE] = decision.replayLease;
    return true;
  }
}

@Injectable()
export class DeviceBootstrapStatusRateGuard implements CanActivate {
  public constructor(private readonly rateStore: DeviceBootstrapRateStore) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const input = readStatusRateInput(request);
    const decision = await this.rateStore.checkEnrollmentStatus(input);
    if (decision.kind === 'unavailable') {
      throw unavailableDeviceAuth();
    }
    if (decision.kind === 'limited') {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw rateLimitedDeviceAuth();
    }

    return true;
  }
}

@Injectable()
export class DeviceBootstrapTokenExchangeRateGuard implements CanActivate {
  public constructor(private readonly rateStore: DeviceBootstrapRateStore) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BootstrapRequestWithReplayLease>();
    const response = context.switchToHttp().getResponse<Response>();
    const input = readTokenExchangeRateInput(request);
    const decision = await this.rateStore.acquireTokenExchange(input);
    if (decision.kind === 'unavailable') {
      throw unavailableDeviceAuth();
    }
    if (decision.kind === 'limited') {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw rateLimitedDeviceAuth();
    }

    request[DEVICE_BOOTSTRAP_TOKEN_EXCHANGE_REQUEST_LEASE] = decision.requestLease;
    return true;
  }
}

export function getEnrollmentReplayLease(request: Request): DeviceBootstrapReplayLease | undefined {
  return (request as BootstrapRequestWithReplayLease)[DEVICE_BOOTSTRAP_ENROLLMENT_REPLAY_LEASE];
}

export function getTokenExchangeRequestLease(
  request: Request
): DeviceBootstrapReplayLease | undefined {
  return (request as BootstrapRequestWithReplayLease)[
    DEVICE_BOOTSTRAP_TOKEN_EXCHANGE_REQUEST_LEASE
  ];
}

function readEnrollmentRateInput(request: Request): {
  readonly peerAddress: string;
  readonly enrollmentCode: string;
  readonly enrollmentAttemptId: string;
} {
  const body = asRecord(request.body);
  const enrollmentCode = readString(body, 'enrollmentCode');
  const enrollmentAttemptId = readString(body, 'enrollmentAttemptId');
  if (!enrollmentCode || !enrollmentAttemptId) {
    throw invalidBootstrapRequest();
  }

  return {
    peerAddress: getPeerAddress(request),
    enrollmentCode,
    enrollmentAttemptId,
  };
}

function readStatusRateInput(request: Request): {
  readonly peerAddress: string;
  readonly refreshCredential: string;
} {
  const body = asRecord(request.body);
  const refreshCredential = readString(body, 'refreshCredential');
  if (!refreshCredential) {
    throw invalidBootstrapRequest();
  }

  return {
    peerAddress: getPeerAddress(request),
    refreshCredential,
  };
}

function readTokenExchangeRateInput(request: Request): {
  readonly peerAddress: string;
  readonly refreshCredential: string;
  readonly refreshRequestId: string;
} {
  const body = asRecord(request.body);
  const refreshCredential = readString(body, 'refreshCredential');
  const refreshRequestId = readString(body, 'refreshRequestId');
  if (!refreshCredential || !refreshRequestId) {
    throw invalidBootstrapRequest();
  }

  return {
    peerAddress: getPeerAddress(request),
    refreshCredential,
    refreshRequestId,
  };
}

function getPeerAddress(request: Request): string {
  const peerAddress = request.socket?.remoteAddress;
  return typeof peerAddress === 'string' && peerAddress.length > 0 ? peerAddress : 'unknown';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readString(body: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = body?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
