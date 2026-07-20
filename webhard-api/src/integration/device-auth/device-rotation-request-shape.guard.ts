import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { invalidBootstrapRequest } from './device-bootstrap.errors';

const PREPARE_KEYS = ['refreshCredential', 'candidateCredential'] as const;
const ACK_KEYS = ['candidateCredential'] as const;

@Injectable()
export class DeviceRotationPrepareRequestShapeGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    return assertRotationShape(context, PREPARE_KEYS);
  }
}

@Injectable()
export class DeviceRotationAckRequestShapeGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    return assertRotationShape(context, ACK_KEYS);
  }
}

function assertRotationShape(context: ExecutionContext, expectedKeys: readonly string[]): boolean {
  const body = context.switchToHttp().getRequest<Request>().body;
  if (!hasExactCredentialShape(body, expectedKeys)) throw invalidBootstrapRequest();
  return true;
}

function hasExactCredentialShape(value: unknown, expectedKeys: readonly string[]): boolean {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    return false;
  }
  const keys = Object.getOwnPropertyNames(value).sort();
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    return false;
  }
  const body = value as Record<string, unknown>;
  return expectedKeys.every((key) => {
    const credential = body[key];
    return (
      Object.prototype.hasOwnProperty.call(body, key) &&
      typeof credential === 'string' &&
      credential.length > 0
    );
  });
}
