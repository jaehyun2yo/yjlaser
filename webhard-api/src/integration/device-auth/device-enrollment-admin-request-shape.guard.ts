import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const ALLOWED_REQUEST_KEYS = ['programType', 'capabilityProfile', 'expectedDisplayName'] as const;

/**
 * Executes before global ValidationPipe silently strips unknown fields. The
 * body has already been parsed by Express, so this enforces the exact parsed
 * JSON object shape while DTO validation handles individual field values.
 */
@Injectable()
export class DeviceEnrollmentAdminRequestShapeGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!hasExactRequestShape(request.body)) {
      throw new BadRequestException({
        code: 'DEVICE_ENROLLMENT_REQUEST_INVALID',
        message: 'Invalid enrollment-code request',
      });
    }

    return true;
  }
}

function hasExactRequestShape(
  value: unknown
): value is Record<(typeof ALLOWED_REQUEST_KEYS)[number], unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }

  const keys = Object.getOwnPropertyNames(value).sort();
  const expectedKeys = [...ALLOWED_REQUEST_KEYS].sort();
  if (keys.length !== expectedKeys.length) {
    return false;
  }

  return keys.every((key, index) => key === expectedKeys[index]);
}
