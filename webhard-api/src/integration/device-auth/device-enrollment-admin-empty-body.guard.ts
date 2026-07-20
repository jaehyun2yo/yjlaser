import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;.*)?$/i;

/**
 * Device-management actions are command endpoints rather than data intake
 * endpoints. They accept an exact zero-octet body only, before the global
 * ValidationPipe can parse, strip, or coerce an unexpected payload.
 */
@Injectable()
export class DeviceEnrollmentAdminEmptyBodyGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    if (!isZeroOctetRequest(request)) {
      throw new BadRequestException({
        code: 'device_management_invalid',
        message: 'Invalid device management request',
      });
    }

    return true;
  }
}

function isZeroOctetRequest(request: Request): boolean {
  if (
    hasHeader(request, 'transfer-encoding') ||
    getRawHeaderValues(request, 'transfer-encoding').length > 0
  ) {
    return false;
  }

  const contentLengths = getRawHeaderValues(request, 'content-length');
  if (contentLengths.length > 1 || !isExactZeroOrAbsentHeader(request, 'content-length')) {
    return false;
  }
  if (contentLengths.length === 1 && contentLengths[0] !== '0') {
    return false;
  }

  const contentTypes = getRawHeaderValues(request, 'content-type');
  if (contentTypes.length > 1 || !isAllowedJsonOrAbsentHeader(request, 'content-type')) {
    return false;
  }
  if (contentTypes.length === 1 && !isAllowedJsonContentType(contentTypes[0])) {
    return false;
  }

  if (request.body === undefined) {
    return true;
  }

  return (
    isPlainEmptyObject(request.body) && contentLengths.length === 1 && contentLengths[0] === '0'
  );
}

function hasHeader(request: Request, headerName: string): boolean {
  return Object.prototype.hasOwnProperty.call(request.headers, headerName);
}

function isExactZeroOrAbsentHeader(request: Request, headerName: 'content-length'): boolean {
  if (!hasHeader(request, headerName)) {
    return true;
  }

  return request.headers[headerName] === '0';
}

function isAllowedJsonOrAbsentHeader(request: Request, headerName: 'content-type'): boolean {
  if (!hasHeader(request, headerName)) {
    return true;
  }

  const value = request.headers[headerName];
  return typeof value === 'string' && isAllowedJsonContentType(value);
}

function isAllowedJsonContentType(value: string): boolean {
  return JSON_CONTENT_TYPE.test(value);
}

function getRawHeaderValues(request: Request, headerName: string): string[] {
  const values: string[] = [];
  const rawHeaders = getRawHeaders(request);
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    if (rawHeaders[index].toLowerCase() === headerName) {
      values.push(rawHeaders[index + 1]);
    }
  }

  return values;
}

function getRawHeaders(request: Request): readonly string[] {
  const rawHeaders = (request as { readonly rawHeaders?: unknown }).rawHeaders;
  if (!Array.isArray(rawHeaders) || rawHeaders.some((value) => typeof value !== 'string')) {
    return [];
  }

  return rawHeaders;
}

function isPlainEmptyObject(value: unknown): value is Record<PropertyKey, never> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === 0
  );
}
