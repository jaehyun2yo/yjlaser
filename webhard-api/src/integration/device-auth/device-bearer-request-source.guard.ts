import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

const DEVICE_BEARER_TOKEN = Symbol('DEVICE_BEARER_TOKEN');
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;
const FORBIDDEN_HEADER_NAMES = [
  'proxy-authorization',
  'cookie',
  'x-api-key',
  'x-account-recovery-key',
  'x-csrf-token',
  'x-session-token',
  'origin',
  'referer',
] as const;

type BearerRequest = Request & { [DEVICE_BEARER_TOKEN]?: string };

@Injectable()
export class DeviceBearerRequestSourceGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<BearerRequest>();
    if (FORBIDDEN_HEADER_NAMES.some((name) => getRawHeaderValues(request, name).length > 0)) {
      throw invalidAccess();
    }

    const authorizationValues = getRawHeaderValues(request, 'authorization');
    if (authorizationValues.length !== 1) {
      throw invalidAccess();
    }
    const match = BEARER_PATTERN.exec(authorizationValues[0]);
    if (!match || authorizationValues[0].includes(',')) {
      throw invalidAccess();
    }

    request[DEVICE_BEARER_TOKEN] = match[1];
    return true;
  }

  public static getBearerToken(context: ExecutionContext): string | undefined {
    return getDeviceBearerToken(context.switchToHttp().getRequest<Request>());
  }
}

export function getDeviceBearerToken(request: Request): string | undefined {
  return (request as BearerRequest)[DEVICE_BEARER_TOKEN];
}

function getRawHeaderValues(request: Request, name: string): string[] {
  const normalized = name.toLowerCase();
  const values: string[] = [];
  for (let index = 0; index < (request.rawHeaders ?? []).length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === normalized) {
      values.push(request.rawHeaders[index + 1] ?? '');
    }
  }
  if (values.length > 0) {
    return values;
  }

  const value = Object.entries(request.headers ?? {}).find(
    ([candidate]) => candidate.toLowerCase() === normalized
  )?.[1];
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === 'string' ? [value] : [];
}

function invalidAccess(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'device_access_invalid',
    message: 'Device access rejected',
  });
}
