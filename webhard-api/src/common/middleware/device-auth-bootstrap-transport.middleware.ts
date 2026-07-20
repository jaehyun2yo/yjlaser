import { json, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

export const DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH = '/api/v1/integration/device-auth/enroll';
export const DEVICE_AUTH_BOOTSTRAP_STATUS_PATH =
  '/api/v1/integration/device-auth/enrollment-status';
export const DEVICE_AUTH_TOKEN_PATH = '/api/v1/integration/device-auth/token';

const DEVICE_AUTH_BOOTSTRAP_PATHS = new Set<string>([
  DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH,
  DEVICE_AUTH_BOOTSTRAP_STATUS_PATH,
  DEVICE_AUTH_TOKEN_PATH,
]);
const FORBIDDEN_AMBIENT_HEADER_NAMES = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
  'x-account-recovery-key',
  'x-csrf-token',
  'x-session-token',
  'origin',
  'referer',
  'transfer-encoding',
] as const;
const MAX_DEVICE_AUTH_BOOTSTRAP_BODY_BYTES = 4 * 1024;
const GENERIC_TRANSPORT_ERROR_CODE = 'DEVICE_AUTH_BOOTSTRAP_REQUEST_REJECTED';
const STRICT_JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8\s*)?$/i;
const IDENTITY_CONTENT_ENCODING = /^identity$/i;

export interface DeviceAuthBootstrapRequestTarget {
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

/**
 * Routes used before a device has a browser session. They deliberately get a
 * small, non-inflating JSON parser before the application's generic parser.
 */
export function createDeviceAuthBootstrapTransportMiddleware(): RequestHandler {
  const bootstrapJsonParser = json({
    limit: MAX_DEVICE_AUTH_BOOTSTRAP_BODY_BYTES,
    inflate: false,
    strict: true,
    type: () => true,
  });

  return (request: Request, response: Response, next: NextFunction): void => {
    if (!isDeviceAuthBootstrapPost(request)) {
      next();
      return;
    }

    response.setHeader('Cache-Control', 'no-store, private');
    const requestTarget = getRequestTarget(request);
    if (
      !isCanonicalDeviceAuthBootstrapPath(requestTarget.path) ||
      requestTarget.hasQuery ||
      hasForbiddenAmbientHeader(request)
    ) {
      sendGenericTransportError(response, 400);
      return;
    }

    if (!hasStrictJsonContentType(request) || !hasOnlyIdentityContentEncoding(request)) {
      sendGenericTransportError(response, 415);
      return;
    }

    bootstrapJsonParser(request, response, (error?: unknown): void => {
      if (error) {
        sendGenericTransportError(response, getParserErrorStatus(error));
        return;
      }

      next();
    });
  };
}

/**
 * Keeps the generic 10 MiB JSON/urlencoded parsers away from bootstrap paths.
 * A query-bearing bootstrap request is also reserved here so the dedicated
 * middleware can return its generic rejection before a larger parser reads it.
 */
export function shouldSkipGenericBodyParserForDeviceAuthBootstrap(
  request: DeviceAuthBootstrapRequestTarget
): boolean {
  return isDeviceAuthBootstrapPost(request);
}

function isDeviceAuthBootstrapPost(request: DeviceAuthBootstrapRequestTarget): boolean {
  return (
    request.method === 'POST' &&
    isDeviceAuthBootstrapRouteOrTrailingSlashAlias(getRequestTarget(request).path)
  );
}

function isCanonicalDeviceAuthBootstrapPath(path: string): boolean {
  return DEVICE_AUTH_BOOTSTRAP_PATHS.has(path);
}

function isDeviceAuthBootstrapRouteOrTrailingSlashAlias(path: string): boolean {
  // Express routes are case-insensitive by default. Reserve those aliases
  // too, then reject every non-canonical spelling below before a generic
  // parser can inflate or read its body.
  return isCanonicalDeviceAuthBootstrapPath(normalizePathForRouteComparison(path).toLowerCase());
}

function normalizePathForRouteComparison(path: string): string {
  try {
    const normalizedPathname = new URL(path, 'http://device-auth.invalid').pathname;
    const decodedPathname = decodeURIComponent(normalizedPathname);
    const withoutTrailingSlashes = decodedPathname.replace(/\/+$/, '');
    return withoutTrailingSlashes || '/';
  } catch {
    return path;
  }
}

function getRequestTarget(request: DeviceAuthBootstrapRequestTarget): {
  readonly path: string;
  readonly hasQuery: boolean;
} {
  const rawUrl = request.originalUrl ?? request.url ?? '';
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex < 0) {
    return { path: rawUrl, hasQuery: false };
  }

  return {
    path: rawUrl.slice(0, queryIndex),
    hasQuery: true,
  };
}

function hasForbiddenAmbientHeader(request: Request): boolean {
  return FORBIDDEN_AMBIENT_HEADER_NAMES.some((headerName) => hasHeader(request, headerName));
}

function hasStrictJsonContentType(request: Request): boolean {
  if (!hasHeader(request, 'content-type')) {
    return false;
  }

  const values = getHeaderValues(request, 'content-type');
  return values.length === 1 && STRICT_JSON_CONTENT_TYPE.test(values[0].trim());
}

function hasOnlyIdentityContentEncoding(request: Request): boolean {
  if (!hasHeader(request, 'content-encoding')) {
    return true;
  }

  const values = getHeaderValues(request, 'content-encoding');
  return values.length === 1 && IDENTITY_CONTENT_ENCODING.test(values[0].trim());
}

function hasHeader(request: Request, headerName: string): boolean {
  const normalizedHeaderName = headerName.toLowerCase();
  const rawHeaders = request.rawHeaders;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === normalizedHeaderName) {
      return true;
    }
  }

  return Object.keys(request.headers).some(
    (candidateHeaderName) => candidateHeaderName.toLowerCase() === normalizedHeaderName
  );
}

function getHeaderValues(request: Request, headerName: string): string[] {
  const normalizedHeaderName = headerName.toLowerCase();
  const rawValues: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === normalizedHeaderName) {
      rawValues.push(request.rawHeaders[index + 1] ?? '');
    }
  }

  if (rawValues.length > 0) {
    return rawValues;
  }

  const values: string[] = [];
  for (const [candidateHeaderName, value] of Object.entries(request.headers)) {
    if (candidateHeaderName.toLowerCase() !== normalizedHeaderName) {
      continue;
    }

    if (Array.isArray(value)) {
      values.push(...value);
      continue;
    }

    if (typeof value === 'string') {
      values.push(value);
    }
  }

  return values;
}

function getParserErrorStatus(error: unknown): 400 | 413 | 415 {
  if (!isRecord(error)) {
    return 400;
  }

  const status = error.status ?? error.statusCode;
  if (status === 413 || error.type === 'entity.too.large') {
    return 413;
  }

  if (status === 415 || error.type === 'encoding.unsupported') {
    return 415;
  }

  return 400;
}

function sendGenericTransportError(response: Response, statusCode: 400 | 413 | 415): void {
  response.status(statusCode).set('Cache-Control', 'no-store, private').json({
    statusCode,
    code: GENERIC_TRANSPORT_ERROR_CODE,
    message: GENERIC_TRANSPORT_ERROR_CODE,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
