import { json, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

export const DEVICE_AUTH_BEARER_HEARTBEAT_PATH = '/api/v1/integration/devices/heartbeat';
export const DEVICE_AUTH_BEARER_CANARY_PATH = '/api/v1/integration/devices/canary';
export const DEVICE_AUTH_ROTATION_PREPARE_PATH_PREFIX =
  '/api/v1/integration/devices/credential-rotations/';

const DEVICE_AUTH_BEARER_PATHS = new Set<string>([
  DEVICE_AUTH_BEARER_HEARTBEAT_PATH,
  DEVICE_AUTH_BEARER_CANARY_PATH,
]);
const FORBIDDEN_AMBIENT_HEADER_NAMES = [
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
const MAXIMUM_BODY_BYTES = 4 * 1024;
const GENERIC_TRANSPORT_ERROR_CODE = 'DEVICE_AUTH_BEARER_REQUEST_REJECTED';
const STRICT_JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8\s*)?$/i;
const IDENTITY_CONTENT_ENCODING = /^identity$/i;

export interface DeviceAuthBearerRequestTarget {
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

export function createDeviceAuthBearerTransportMiddleware(): RequestHandler {
  const strictJsonParser = json({
    limit: MAXIMUM_BODY_BYTES,
    inflate: false,
    strict: true,
    type: () => true,
  });

  return (request: Request, response: Response, next: NextFunction): void => {
    if (!isDeviceAuthBearerPost(request)) {
      next();
      return;
    }

    response.setHeader('Cache-Control', 'no-store, private');
    const target = getRequestTarget(request);
    if (
      !isCanonicalBearerPath(target.path) ||
      target.hasQuery ||
      hasForbiddenAmbientHeader(request)
    ) {
      sendTransportError(response, 400);
      return;
    }

    if (!hasOnlyIdentityContentEncoding(request)) {
      sendTransportError(response, 415);
      return;
    }

    const isCanary = target.path === DEVICE_AUTH_BEARER_CANARY_PATH;
    const rotationAction = getRotationAction(target.path);
    if (isCanary && !hasRequestBody(request)) {
      request.body = {};
      next();
      return;
    }

    if (!hasStrictJsonContentType(request)) {
      sendTransportError(response, 415);
      return;
    }

    strictJsonParser(request, response, (error?: unknown): void => {
      if (error) {
        sendTransportError(response, getParserErrorStatus(error));
        return;
      }
      if (!isOwnKeyObject(request.body) || (isCanary && Object.keys(request.body).length !== 0)) {
        sendTransportError(response, 400);
        return;
      }
      const allowedKeys =
        rotationAction === 'prepare'
          ? ['refreshCredential', 'candidateCredential']
          : rotationAction === 'ack'
            ? ['candidateCredential']
            : ['appVersion'];
      if (
        !isCanary &&
        (Object.keys(request.body).length !== allowedKeys.length ||
          Object.keys(request.body).some((key) => !allowedKeys.includes(key)))
      ) {
        sendTransportError(response, 400);
        return;
      }
      next();
    });
  };
}

export function shouldSkipGenericBodyParserForDeviceAuthBearer(
  request: DeviceAuthBearerRequestTarget
): boolean {
  return isDeviceAuthBearerPost(request);
}

function isDeviceAuthBearerPost(request: DeviceAuthBearerRequestTarget): boolean {
  return (
    request.method === 'POST' &&
    isBearerRouteOrAlias(normalizePathForRouteComparison(getRequestTarget(request).path))
  );
}

function isCanonicalBearerPath(path: string): boolean {
  return DEVICE_AUTH_BEARER_PATHS.has(path) || getRotationAction(path) !== undefined;
}

function isBearerRouteOrAlias(path: string): boolean {
  return (
    DEVICE_AUTH_BEARER_PATHS.has(path.toLowerCase()) ||
    /^\/api\/v1\/integration\/devices\/credential-rotations\/[0-9a-f-]+\/(prepare|ack)$/i.test(path)
  );
}

function getRotationAction(path: string): 'prepare' | 'ack' | undefined {
  const match = new RegExp(
    `^${DEVICE_AUTH_ROTATION_PREPARE_PATH_PREFIX}([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\/(prepare|ack)$`
  ).exec(path);
  return match?.[2] === 'prepare' || match?.[2] === 'ack' ? match[2] : undefined;
}

function normalizePathForRouteComparison(path: string): string {
  try {
    const pathname = new URL(path, 'http://device-auth.invalid').pathname;
    const decoded = decodeURIComponent(pathname);
    const withoutTrailingSlashes = decoded.replace(/\/+$/, '');
    return (withoutTrailingSlashes || '/').toLowerCase();
  } catch {
    return path;
  }
}

function getRequestTarget(request: DeviceAuthBearerRequestTarget): {
  readonly path: string;
  readonly hasQuery: boolean;
} {
  const rawUrl = request.originalUrl ?? request.url ?? '';
  const queryIndex = rawUrl.indexOf('?');
  return queryIndex < 0
    ? { path: rawUrl, hasQuery: false }
    : { path: rawUrl.slice(0, queryIndex), hasQuery: true };
}

function hasForbiddenAmbientHeader(request: Request): boolean {
  return FORBIDDEN_AMBIENT_HEADER_NAMES.some((name) => hasHeader(request, name));
}

function hasStrictJsonContentType(request: Request): boolean {
  const values = getHeaderValues(request, 'content-type');
  return values.length === 1 && STRICT_JSON_CONTENT_TYPE.test(values[0].trim());
}

function hasOnlyIdentityContentEncoding(request: Request): boolean {
  const values = getHeaderValues(request, 'content-encoding');
  return values.length === 0 || (values.length === 1 && IDENTITY_CONTENT_ENCODING.test(values[0]));
}

function hasRequestBody(request: Request): boolean {
  const contentLengthValues = getHeaderValues(request, 'content-length');
  if (contentLengthValues.length === 1) {
    const contentLength = Number(contentLengthValues[0]);
    return Number.isSafeInteger(contentLength) && contentLength > 0;
  }
  return hasHeader(request, 'content-type');
}

function hasHeader(request: Request, name: string): boolean {
  return getHeaderValues(request, name).length > 0;
}

function getHeaderValues(request: Request, name: string): string[] {
  const normalized = name.toLowerCase();
  const rawValues: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === normalized) {
      rawValues.push(request.rawHeaders[index + 1] ?? '');
    }
  }
  if (rawValues.length > 0) {
    return rawValues;
  }

  const value = Object.entries(request.headers).find(
    ([candidate]) => candidate.toLowerCase() === normalized
  )?.[1];
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === 'string' ? [value] : [];
}

function getParserErrorStatus(error: unknown): 400 | 413 | 415 {
  if (!isRecord(error)) {
    return 400;
  }
  if (error.status === 413 || error.statusCode === 413 || error.type === 'entity.too.large') {
    return 413;
  }
  if (error.status === 415 || error.statusCode === 415 || error.type === 'encoding.unsupported') {
    return 415;
  }
  return 400;
}

function sendTransportError(response: Response, statusCode: 400 | 413 | 415): void {
  response.status(statusCode).set('Cache-Control', 'no-store, private').json({
    statusCode,
    code: GENERIC_TRANSPORT_ERROR_CODE,
    message: GENERIC_TRANSPORT_ERROR_CODE,
  });
}

function isOwnKeyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
