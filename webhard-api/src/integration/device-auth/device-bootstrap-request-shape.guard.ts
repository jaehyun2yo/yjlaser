import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { invalidBootstrapRequest } from './device-bootstrap.errors';

const ENROLL_REQUIRED_KEYS = [
  'enrollmentCode',
  'enrollmentAttemptId',
  'displayName',
  'refreshCredential',
] as const;
const ENROLL_OPTIONAL_KEYS = ['appVersion'] as const;
const STATUS_REQUIRED_KEYS = ['enrollmentAttemptId', 'refreshCredential'] as const;
const TOKEN_EXCHANGE_REQUIRED_KEYS = [
  'deviceId',
  'refreshCredential',
  'nextRefreshCredential',
  'refreshRequestId',
] as const;

/**
 * Guards execute before the application's global whitelist pipe, which would
 * otherwise silently remove fields that this privacy-sensitive protocol must
 * reject.
 */
@Injectable()
export class DeviceBootstrapEnrollRequestShapeGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!hasExactPlainObjectShape(request.body, ENROLL_REQUIRED_KEYS, ENROLL_OPTIONAL_KEYS)) {
      throw invalidBootstrapRequest();
    }

    return true;
  }
}

@Injectable()
export class DeviceBootstrapStatusRequestShapeGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!hasExactPlainObjectShape(request.body, STATUS_REQUIRED_KEYS, [])) {
      throw invalidBootstrapRequest();
    }

    return true;
  }
}

@Injectable()
export class DeviceTokenExchangeRequestShapeGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      !hasExactPlainObjectShape(request.body, TOKEN_EXCHANGE_REQUIRED_KEYS, []) ||
      !hasRequiredNonEmptyStrings(request.body, TOKEN_EXCHANGE_REQUIRED_KEYS)
    ) {
      throw invalidBootstrapRequest();
    }

    return true;
  }
}

function hasExactPlainObjectShape(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[]
): value is Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return false;
  }

  const actualKeys = Object.getOwnPropertyNames(value).sort();
  const allowedKeys = [...requiredKeys, ...optionalKeys].sort();
  if (
    actualKeys.length < requiredKeys.length ||
    actualKeys.length > allowedKeys.length ||
    requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    return false;
  }

  return actualKeys.every((key) => allowedKeys.includes(key));
}

function hasRequiredNonEmptyStrings(
  value: Record<string, unknown>,
  requiredKeys: readonly string[]
): boolean {
  return requiredKeys.every((key) => typeof value[key] === 'string' && value[key].length > 0);
}
