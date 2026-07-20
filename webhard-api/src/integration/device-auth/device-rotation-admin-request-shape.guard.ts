import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { DeviceAuthRotationRuntimeOptions } from './device-auth.runtime-config';
import { DEVICE_AUTH_ROTATION_OPTIONS } from './device-auth.tokens';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BLOCKED_HEADERS = [
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-account-recovery-key',
  'x-session-token',
] as const;

@Injectable()
export class DeviceRotationAdminRequestShapeGuard implements CanActivate {
  public constructor(
    @Inject(DEVICE_AUTH_ROTATION_OPTIONS)
    private readonly options: Pick<DeviceAuthRotationRuntimeOptions, 'rotationRuntimeEnabled'>
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    if (!this.options.rotationRuntimeEnabled) throw new NotFoundException();
    const request = context.switchToHttp().getRequest<Request>();
    if (BLOCKED_HEADERS.some((name) => hasHeader(request, name))) {
      throw new ForbiddenException({
        code: 'device_rotation_invalid',
        message: 'Ambiguous device credential rotation source',
      });
    }
    if (
      !hasCanonicalParams(request) ||
      hasQuery(request) ||
      hasHeader(request, 'content-encoding') ||
      !hasAllowedContentType(request) ||
      !isExactEmptyBody(request)
    ) {
      throw new BadRequestException({
        code: 'device_rotation_invalid',
        message: 'Invalid device credential rotation request',
      });
    }
    return true;
  }
}

function hasQuery(request: Request): boolean {
  return (
    typeof request.query === 'object' &&
    request.query !== null &&
    Reflect.ownKeys(request.query).length > 0
  );
}

function hasAllowedContentType(request: Request): boolean {
  const values = rawValues(request, 'content-type');
  if (values.length > 1) return false;
  const normalized = request.headers['content-type'];
  if (normalized === undefined && values.length === 0) return true;
  if (typeof normalized !== 'string') return false;
  return (
    /^application\/json(?:\s*;.*)?$/i.test(normalized) &&
    (values.length === 0 || /^application\/json(?:\s*;.*)?$/i.test(values[0]))
  );
}

function hasCanonicalParams(request: Request): boolean {
  const params = request.params as Record<string, unknown>;
  const deviceId = params.id;
  const rotationId = params.rotationId;
  return (
    typeof deviceId === 'string' &&
    UUID_PATTERN.test(deviceId) &&
    (rotationId === undefined || (typeof rotationId === 'string' && UUID_PATTERN.test(rotationId)))
  );
}

function hasHeader(request: Request, name: string): boolean {
  if (Object.prototype.hasOwnProperty.call(request.headers, name)) return true;
  return getRawHeaders(request).some(
    (value, index) => index % 2 === 0 && value.toLowerCase() === name
  );
}

function isExactEmptyBody(request: Request): boolean {
  if (hasHeader(request, 'transfer-encoding')) return false;
  const lengths = rawValues(request, 'content-length');
  if (lengths.length > 1) return false;
  const normalizedLength = request.headers['content-length'];
  if (normalizedLength !== undefined && normalizedLength !== '0') return false;
  if (lengths.length === 1 && lengths[0] !== '0') return false;
  if (request.body === undefined) return true;
  return (
    typeof request.body === 'object' &&
    request.body !== null &&
    !Array.isArray(request.body) &&
    Object.getPrototypeOf(request.body) === Object.prototype &&
    Reflect.ownKeys(request.body).length === 0 &&
    (normalizedLength === undefined || normalizedLength === '0' || lengths[0] === '0')
  );
}

function rawValues(request: Request, name: string): string[] {
  const raw = getRawHeaders(request);
  const values: string[] = [];
  for (let index = 0; index + 1 < raw.length; index += 2) {
    if (raw[index].toLowerCase() === name) values.push(raw[index + 1]);
  }
  return values;
}

function getRawHeaders(request: Request): readonly string[] {
  const value = (request as { readonly rawHeaders?: unknown }).rawHeaders;
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : [];
}
