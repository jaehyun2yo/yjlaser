import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The global CSRF guard exempts X-API-Key and X-Account-Recovery-Key requests.
 * This administrator-only boundary is strictly session-only, so it also
 * rejects Authorization and duplicate raw credential headers even if a valid
 * browser session is present.
 */
@Injectable()
export class DeviceEnrollmentAdminSessionSourceGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (hasBlockedCredentialSource(request) || !hasExclusiveAdminSession(request)) {
      throw new ForbiddenException('Session credential source required');
    }

    return true;
  }
}

const BLOCKED_CREDENTIAL_HEADERS = [
  'x-api-key',
  'x-account-recovery-key',
  'authorization',
  'proxy-authorization',
  'x-session-token',
] as const;

const AUTH_COOKIE_NAMES = new Set([
  'admin-session',
  'company-session',
  'worker-session',
  'erp-session',
]);

function hasBlockedCredentialSource(request: Request): boolean {
  return BLOCKED_CREDENTIAL_HEADERS.some(
    (headerName) =>
      Object.prototype.hasOwnProperty.call(request.headers, headerName) ||
      rawHeaderContains(request.rawHeaders, headerName)
  );
}

function hasExclusiveAdminSession(request: Request): boolean {
  const rawCookieHeaders = rawHeaderValues(request.rawHeaders, 'cookie');
  if (rawCookieHeaders.length > 1) return false;
  const normalized = request.headers.cookie;
  if (Array.isArray(normalized)) return false;
  const cookie = rawCookieHeaders[0] ?? normalized;
  if (typeof cookie !== 'string' || cookie.length === 0) return false;

  const authCookies = cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator < 0
        ? { name: part.toLowerCase(), value: '' }
        : {
            name: part.slice(0, separator).trim().toLowerCase(),
            value: part.slice(separator + 1),
          };
    })
    .filter((entry) => AUTH_COOKIE_NAMES.has(entry.name));

  return (
    authCookies.length === 1 &&
    authCookies[0].name === 'admin-session' &&
    authCookies[0].value.length > 0
  );
}

function rawHeaderContains(rawHeaders: unknown, headerName: string): boolean {
  const safeRawHeaders = Array.isArray(rawHeaders) ? rawHeaders : [];
  for (let index = 0; index < safeRawHeaders.length; index += 2) {
    if (
      typeof safeRawHeaders[index] === 'string' &&
      safeRawHeaders[index].toLowerCase() === headerName
    ) {
      return true;
    }
  }

  return false;
}

function rawHeaderValues(rawHeaders: unknown, headerName: string): string[] {
  const safeRawHeaders = Array.isArray(rawHeaders) ? rawHeaders : [];
  const values: string[] = [];
  for (let index = 0; index + 1 < safeRawHeaders.length; index += 2) {
    if (
      typeof safeRawHeaders[index] === 'string' &&
      safeRawHeaders[index].toLowerCase() === headerName &&
      typeof safeRawHeaders[index + 1] === 'string'
    ) {
      values.push(safeRawHeaders[index + 1]);
    }
  }
  return values;
}
